// Move dotenv import to the very top before any other imports
import "dotenv/config"; // Load environment variables
console.log(
  "Environment loaded, DATABASE_URL:",
  process.env.DATABASE_URL ? "Set" : "NOT SET",
);
import { Client, GatewayIntentBits } from "discord.js";
import commandHandler from "./handlers/command.js";
import eventHandler from "./handlers/event.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import express from "express";
import admin from "firebase-admin";
import sql from "./db.js";
import cors from "cors";
import fs from "fs";
import {
  verificationSessionService,
  VerificationSessionError,
} from "./services/verificationSessionService.js";
import * as guildVerificationConfigStore from "./repositories/guildVerificationConfigsRepository.js";
import PeriodicVerificationService from "./services/periodicVerification.js";
import { PublicKey } from '@solana/web3.js';
import { heliusRateLimiter } from "./utils/rateLimiter.js";
import withdrawalLogger from "./services/withdrawalLogger.js";

// Check for essential environment variables
if (!process.env.DISCORD_BOT_TOKEN) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is not set.");
}
if (!process.env.HELIUS_API_KEY) {
  // Helius is preferred, so its API key is essential if we want to use it.
  console.warn(
    "HELIUS_API_KEY environment variable is not set. Helius fetching will be skipped.",
  );
}
if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL environment variable is not set.");
}
if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY environment variable is not set.");
}

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Required for message content to be accessible
  ],
});

// Admin check using Firebase auth
function isAdminUid(uid) {
  const list = String(process.env.ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(uid);
}

async function resolveUserIdByTarget({
  firebaseUid,
  walletAddress,
  discordId,
}) {
  if (firebaseUid) {
    return await ensureUserForFirebaseUid(firebaseUid);
  }
  if (walletAddress) {
    if (!admin.apps.length || !admin.firestore) return null;
    const fs = admin.firestore();
    const walletDoc = await fs
      .collection("wallets")
      .doc(String(walletAddress).toLowerCase())
      .get();
    const mappedUid = walletDoc.exists ? (walletDoc.data() || {}).uid : null;
    if (!mappedUid) return null;
    return await ensureUserForFirebaseUid(mappedUid);
  }
  if (discordId) {
    const rows =
      await sql`select user_id from user_links where discord_id = ${discordId}`;
    return rows[0]?.user_id || null;
  }
  return null;
}

// (routes moved below app initialization)

// (moved admin backfill route below app initialization)

// Log in to Discord with your client's token
client.login(process.env.DISCORD_BOT_TOKEN);

// Load commands and events
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Initialize game database tables
  try {
    // Initialize linked wallets table first (required for foreign keys)
    const { initLinkedWalletsTable } = await import("./data/userWallets.js");
    await initLinkedWalletsTable();
    console.log("Linked wallets table initialized successfully");

    const { initializeGameTables } = await import("./data/realmkins.js");
    await initializeGameTables();
    console.log("Game tables initialized successfully");

    // Initialize fused characters table
    const { initializeFusedCharacters } = await import(
      "./data/fusedCharacters.js"
    );
    await initializeFusedCharacters();
    console.log("Fused characters table initialized successfully");

    // Initialize PvP schema (challenges, sessions, logs)
    try {
      const { initPvpSchema } = await import("./data/pvpSessions.js");
      await initPvpSchema();
      console.log("PvP schema initialized successfully");
    } catch (e) {
      console.warn(
        "PvP schema initialization skipped/failed:",
        e?.message || e,
      );
    }
  } catch (error) {
    console.error("Error initializing game tables:", error);
  }

  await commandHandler(client); // Load commands into client.commands
  await eventHandler(client); // Register event listeners

  // Start periodic verification service
  const periodicVerification = new PeriodicVerificationService(client);
  periodicVerification.start();

  // Export the periodic verification service for use in commands
  global.periodicVerificationService = periodicVerification;

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down gracefully...");
    periodicVerification.stop();
    process.exit(0);
  });

  // Register slash commands: prefer guild for fast updates if DISCORD_GUILD_ID is set
  const rest = new REST({ version: "10" }).setToken(
    process.env.DISCORD_BOT_TOKEN,
  );
  try {
    const body = Array.from(client.commands.values()).map((cmd) =>
      cmd.data.toJSON(),
    );
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;
    console.log(
      "Started refreshing application (/) commands. Mode:",
      guildId ? "Guild" : "Global",
    );

    if (guildId) {
      // Clear GLOBAL commands to avoid duplicates if we previously registered globally
      try {
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log(
          "Cleared GLOBAL application (/) commands to prevent duplicates.",
        );
      } catch (clearErr) {
        console.warn(
          "Warning: Failed to clear GLOBAL commands (continuing with guild registration):",
          clearErr?.message || clearErr,
        );
      }

      // Register GUILD commands (fast propagation)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body,
      });
      console.log(
        `Successfully reloaded GUILD application (/) commands for guild ${guildId}. Count: ${body.length}`,
      );
    } else {
      // Register GLOBAL commands
      await rest.put(Routes.applicationCommands(clientId), { body });
      console.log(
        `Successfully reloaded GLOBAL application (/) commands. Count: ${body.length}`,
      );
    }
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

// Initialize Firebase Admin for verifying Firebase ID tokens
if (!admin.apps.length) {
  try {
    let svcJson = null;
    const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (rawEnv) {
      // Strip UTF-8 BOM if present and trim
      let content = rawEnv.replace(/^\uFEFF/, "").trim();
      if (content.startsWith("{")) {
        // JSON directly in env var
        svcJson = JSON.parse(content);
      } else if (/\.json$/i.test(content)) {
        // Treat as path to a JSON file (fallback)
        try {
          const fileStr = fs
            .readFileSync(content, "utf8")
            .replace(/^\uFEFF/, "");
          svcJson = JSON.parse(fileStr);
        } catch (e) {
          console.warn(
            "Failed to read service account JSON from path:",
            content,
            e,
          );
        }
      } else {
        // Unexpected format; attempt JSON parse anyway after BOM strip
        try {
          svcJson = JSON.parse(content);
        } catch (_) {
          /* ignore */
        }
      }
    }

    if (svcJson) {
      const initConfig = { 
        credential: admin.credential.cert(svcJson)
      };
      
      // Add databaseURL if available for Realtime Database
      if (process.env.FIREBASE_DATABASE_URL) {
        initConfig.databaseURL = process.env.FIREBASE_DATABASE_URL;
      }
      
      admin.initializeApp(initConfig);
      console.log("Firebase Admin initialized with project:", svcJson.project_id);
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log("Firebase Admin initialized with application default credentials");
    }
  } catch (err) {
    console.warn(
      "Firebase Admin failed to initialize (API auth disabled):",
      err,
    );
  }
}

// Minimal Express API for frontend without Cloud Functions
const app = express();
app.use(express.json());

// CORS - Support multiple origins (comma-separated in env var)
const allowedOriginsEnv = process.env.ALLOWED_ORIGIN || "*";
const allowedOrigins =
  allowedOriginsEnv === "*"
    ? "*"
    : allowedOriginsEnv
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow all origins if configured with '*'
      if (allowedOrigins === "*") return callback(null, true);

      // Check if origin is in the allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Middleware: verify Firebase ID token from Authorization: Bearer <token>
async function verifyFirebase(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!idToken)
      return res
        .status(401)
        .json({ error: "Missing Authorization Bearer token" });
    if (!admin.apps.length)
      return res.status(503).json({ error: "Auth not configured" });
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.firebaseUid = decoded.uid;
    next();
  } catch (err) {
    console.warn("verifyFirebase error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Helper: ensure a user_links row exists and return user_id
async function ensureUserForFirebaseUid(firebaseUid) {
  const rows = await sql`
        insert into user_links (firebase_uid)
        values (${firebaseUid})
        on conflict (firebase_uid) do update set firebase_uid = excluded.firebase_uid
        returning user_id
    `;
  return rows[0]?.user_id;
}

// GET current balance for authenticated Firebase user
app.get("/api/balance", verifyFirebase, async (req, res) => {
  try {
    const userId = await ensureUserForFirebaseUid(req.firebaseUid);
    const balRows =
      await sql`select balance from user_balances where user_id = ${userId}`;
    const balance = balRows[0]?.balance ?? 0n; // bigint
    res.json({ balance: Number(balance) });
  } catch (err) {
    console.error("GET /api/balance error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET balance by Firebase UID (public endpoint for frontend)
app.get("/api/balance/:firebaseUid", async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    if (!firebaseUid) {
      return res.status(400).json({ error: "firebaseUid required" });
    }

    const userId = await ensureUserForFirebaseUid(firebaseUid);

    // Check if balance needs seeding from Firestore
    const seedEnabled =
      String(process.env.SEED_BALANCE_FROM_LEGACY || "").toLowerCase() ===
      "true";
    if (seedEnabled) {
      try {
        const balRows =
          await sql`select balance from user_balances where user_id = ${userId}`;
        const currentBalance = Number(balRows[0]?.balance || 0);

        // Only seed if balance is 0 or doesn't exist
        if (!balRows[0] || currentBalance === 0) {
          let seedAmount = 0;

          // Try to get balance from Firestore userRewards
          if (admin?.firestore) {
            const fs = admin.firestore();
            const docRef = fs.collection("userRewards").doc(firebaseUid);
            const snap = await docRef.get();
            if (snap.exists) {
              const data = snap.data() || {};
              const totalRealmkin = Number(data.totalRealmkin || 0);
              if (!Number.isNaN(totalRealmkin) && totalRealmkin > 0) {
                seedAmount = totalRealmkin;
              }
            }
          }

          // Seed the balance if we found a non-zero amount
          if (seedAmount > 0) {
            await sql`
                            insert into user_balances (user_id, balance)
                            values (${userId}, ${seedAmount})
                            on conflict (user_id)
                            do update set balance = ${seedAmount}
                            where user_balances.balance < ${seedAmount}
                        `;
            console.log(
              `[balance] Seeded ${seedAmount} MKIN for user ${userId} (firebaseUid: ${firebaseUid})`,
            );
          }
        }
      } catch (seedErr) {
        console.warn("[balance] Failed to seed balance:", seedErr);
      }
    }

    const balRows =
      await sql`select balance from user_balances where user_id = ${userId}`;
    const balance = balRows[0]?.balance ?? 0n; // bigint
    res.json({ balance: Number(balance) });
  } catch (err) {
    console.error("GET /api/balance/:firebaseUid error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST a ledger entry (credit or debit) for the authenticated Firebase user
// body: { delta: number (int), reason: string, refId: string }
app.post("/api/ledger", verifyFirebase, async (req, res) => {
  try {
    const { delta, reason, refId } = req.body || {};
    if (!Number.isInteger(delta))
      return res.status(400).json({ error: "delta must be integer" });
    if (!refId || typeof refId !== "string")
      return res.status(400).json({ error: "refId required" });
    const userId = await ensureUserForFirebaseUid(req.firebaseUid);
    const result = await sql`
            select public.apply_ledger_entry(${userId}::uuid, ${delta}::bigint, ${reason || ""}, ${refId}) as balance
        `;
    const newBalance = result[0]?.balance ?? 0n;
    res.json({ balance: Number(newBalance) });
  } catch (err) {
    if (
      String(err.message || "")
        .toLowerCase()
        .includes("insufficient")
    ) {
      return res.status(400).json({ error: "Insufficient funds" });
    }
    if (
      String(err.message || "")
        .toLowerCase()
        .includes("unique") &&
      req.body?.refId
    ) {
      // Idempotent: refId already processed; return current balance
      try {
        const userId = await ensureUserForFirebaseUid(req.firebaseUid);
        const balRows =
          await sql`select balance from user_balances where user_id = ${userId}`;
        const balance = balRows[0]?.balance ?? 0n;
        return res.json({ balance: Number(balance) });
      } catch (_) {
        /* ignore */
      }
    }
    console.error("POST /api/ledger error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Unlink Discord from this Firebase user
// DELETE /api/link/discord
app.delete("/api/link/discord", verifyFirebase, async (req, res) => {
  try {
    console.log(
      `[link/discord] DELETE: Unlinking Discord for Firebase user ${req.firebaseUid}`,
    );

    const result = await sql`
            delete from user_links where firebase_uid = ${req.firebaseUid}
            returning firebase_uid, discord_id
        `;

    if (result.length === 0) {
      console.log(
        `[link/discord] No Discord link found for Firebase user ${req.firebaseUid}`,
      );
      return res.json({ ok: true, message: "No link to remove" });
    }

    const unlinked = result[0];
    console.log(
      `[link/discord] Successfully unlinked Discord ${unlinked.discord_id} from Firebase user ${req.firebaseUid}`,
    );
    return res.json({ ok: true, message: "Discord unlinked", unlinked });
  } catch (err) {
    console.error("[link/discord] DELETE error:", err);
    return res.status(500).json({ error: "Failed to unlink Discord" });
  }
});

// Link a Discord ID to this Firebase user (optional helper)
// body: { discordId: string }
app.post("/api/link/discord", verifyFirebase, async (req, res) => {
  try {
    const { discordId } = req.body || {};
    if (!discordId)
      return res.status(400).json({ error: "discordId required" });

    // Check if this Discord ID is already linked to a different Firebase user
    const existingLink = await sql`
            select firebase_uid, discord_id from user_links where discord_id = ${discordId}
        `;

    if (existingLink.length > 0) {
      const existing = existingLink[0];
      // If it's already linked to the same Firebase user, return success (idempotent)
      if (existing.firebase_uid === req.firebaseUid) {
        console.log(
          `[link/discord] Discord ${discordId} already linked to this Firebase user`,
        );
        return res.json({
          ok: true,
          message: "Already linked",
          linked: existing,
        });
      }
      // If it's linked to a different user, return error
      console.warn(
        `[link/discord] Discord ${discordId} already linked to different Firebase user`,
      );
      return res
        .status(409)
        .json({ error: "Discord account already linked to another user" });
    }

    // Link the Discord ID to this Firebase user
    const rows = await sql`
            insert into user_links (firebase_uid, discord_id)
            values (${req.firebaseUid}, ${discordId})
            on conflict (firebase_uid) do update set discord_id = excluded.discord_id
            returning user_id, firebase_uid, discord_id
        `;
    const linked = rows[0];
    console.log(
      `[link/discord] Successfully linked Discord ${discordId} to Firebase user ${req.firebaseUid}`,
    );

    // Optionally seed unified balance on first link
    const seedEnabled =
      String(process.env.SEED_BALANCE_FROM_LEGACY || "").toLowerCase() ===
      "true";
    if (seedEnabled && linked?.user_id) {
      try {
        // Prefer Firestore userRewards.totalRealmkin for this firebase_uid
        let seedAmount = 0;
        try {
          if (admin?.firestore) {
            const fs = admin.firestore();
            const docRef = fs
              .collection("userRewards")
              .doc(linked.firebase_uid);
            const snap = await docRef.get();
            if (snap.exists) {
              const data = snap.data() || {};
              const totalRealmkin = Number(data.totalRealmkin || 0);
              if (!Number.isNaN(totalRealmkin) && totalRealmkin > seedAmount) {
                seedAmount = totalRealmkin;
              }
            }
          }
        } catch (e) {
          console.warn("Firestore seed lookup failed:", e);
        }

        // Consider Firestore userRewards by wallet mapping if firebase_uid doc is lower
        try {
          const legacyLink = await sql`
                        select wallet_address from linked_wallets where user_id = ${discordId}
                    `;
          const walletAddr = legacyLink[0]?.wallet_address;
          if (walletAddr && admin?.firestore) {
            const fs = admin.firestore();
            const walletDoc = await fs
              .collection("wallets")
              .doc(String(walletAddr).toLowerCase())
              .get();
            const mappedUid = walletDoc.exists
              ? (walletDoc.data() || {}).uid
              : null;
            if (mappedUid) {
              const walletRewardsSnap = await fs
                .collection("userRewards")
                .doc(mappedUid)
                .get();
              if (walletRewardsSnap.exists) {
                const wr = walletRewardsSnap.data() || {};
                const wrTotal = Number(wr.totalRealmkin || 0);
                if (!Number.isNaN(wrTotal) && wrTotal > seedAmount) {
                  seedAmount = wrTotal;
                }
              }
            }
          }
        } catch (e) {
          console.warn("Wallet-based Firestore seed lookup failed:", e);
        }

        // Fallback to legacy linked_wallets for this Discord ID
        try {
          if (seedAmount === 0) {
            const legacyRows = await sql`
                            select total_mkin_gained from linked_wallets where user_id = ${discordId}
                        `;
            const legacyTotal = Number(legacyRows[0]?.total_mkin_gained || 0);
            if (!Number.isNaN(legacyTotal) && legacyTotal > 0)
              seedAmount = legacyTotal;
          }
        } catch (e) {
          console.warn("Legacy seed lookup failed:", e);
        }

        if (seedAmount > 0) {
          // Check current unified balance
          const balRows = await sql`
                        select balance from user_balances where user_id = ${linked.user_id}
                    `;
          const currentBal = Number(balRows[0]?.balance || 0);
          if (!balRows[0]) {
            await sql`
                            insert into user_balances (user_id, balance) values (${linked.user_id}, ${seedAmount})
                            on conflict (user_id) do nothing
                        `;
          } else if (seedAmount > currentBal) {
            await sql`
                            update user_balances set balance = ${seedAmount} where user_id = ${linked.user_id}
                        `;
          }
        }
      } catch (e) {
        console.warn("Legacy seed on link failed:", e);
      }
    }

    // Send welcome DM with website links (only if in guild to avoid DM policy issues)
    try {
      let canDM = true;
      const guildId = process.env.DISCORD_GUILD_ID;
      if (guildId) {
        try {
          const guild = await client.guilds.fetch(guildId);
          await guild.members.fetch(discordId); // throws if not a member
        } catch (_) {
          canDM = false;
        }
      }
      if (canDM) {
        const user = await client.users.fetch(discordId);
        if (user) {
          await user.send({
            embeds: [
              {
                title: "🎉 Discord Account Linked!",
                description:
                  "Your Discord account has been successfully linked to your Realmkin wallet!\n\n**Quick Actions:**\n🌐 [Visit Dashboard](https://realmkin.com) - Claim rewards & manage wallet\n⚔️ Use `/train` to start earning MKIN\n💰 Check `/balance` anytime\n\n**Next Steps:**\n1. Visit the website to claim any pending rewards\n2. Connect your wallet on the site for full access\n3. Start training to earn MKIN and climb leaderboards!",
                color: 0xda9c2f,
                thumbnail: { url: "https://realmkin.com/realmkin-logo.png" },
                footer: {
                  text: "Realmkin Bot • Click the link above to get started!",
                },
              },
            ],
          });
        }
      } else {
        console.log("[link/discord] Skipping welcome DM: user not in guild yet");
      }
    } catch (dmError) {
      console.warn("Failed to send welcome DM:", dmError);
      // Don't fail the linking process if DM fails
    }

    res.json({ linked: true, user: linked });
  } catch (err) {
    console.error("POST /api/link/discord error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Get current link status for the authenticated Firebase user
app.get("/api/link/status", verifyFirebase, async (req, res) => {
  try {
    const rows = await sql`
            select discord_id from user_links where firebase_uid = ${req.firebaseUid}
        `;
    const discordId = rows[0]?.discord_id || null;
    res.json({ linked: Boolean(discordId), discordId });
  } catch (err) {
    console.error("GET /api/link/status error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Check if the user's linked Discord is a member of the configured guild
app.get("/api/discord/is-member", verifyFirebase, async (req, res) => {
  try {
    // Resolve linked discord id from firebase uid
    const rows = await sql`
      select discord_id from user_links where firebase_uid = ${req.firebaseUid}
    `;
    const discordId = rows[0]?.discord_id || null;
    if (!discordId) {
      return res.json({ member: false, reason: "not_linked" });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      return res.status(500).json({ error: "Guild not configured (DISCORD_GUILD_ID)" });
    }

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members
        .fetch(discordId)
        .then((m) => m)
        .catch(() => null);
      return res.json({ member: Boolean(member) });
    } catch (e) {
      console.warn("[is-member] Error fetching member:", e?.message || e);
      return res.json({ member: false });
    }
  } catch (err) {
    console.error("GET /api/discord/is-member error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET Discord link status by Firebase UID (public endpoint for frontend)
app.get("/api/discord/status/:firebaseUid", async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    if (!firebaseUid) {
      return res.status(400).json({ error: "firebaseUid required" });
    }

    const rows = await sql`
            select discord_id from user_links where firebase_uid = ${firebaseUid}
        `;
    const discordId = rows[0]?.discord_id || null;
    res.json({ linked: Boolean(discordId), discordId });
  } catch (err) {
    console.error("GET /api/discord/status/:firebaseUid error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Transfer MKIN from authenticated Firebase user to recipient by wallet address
// body: { recipientWalletAddress: string, amount: number (int), refId: string }
app.post("/api/transfer", verifyFirebase, async (req, res) => {
  try {
    const { recipientWalletAddress, amount, refId } = req.body || {};
    if (!recipientWalletAddress || typeof recipientWalletAddress !== "string") {
      return res.status(400).json({ error: "recipientWalletAddress required" });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "amount must be a positive integer" });
    }
    if (!refId || typeof refId !== "string") {
      return res.status(400).json({ error: "refId required" });
    }

    // Check Firebase Admin is initialized
    if (!admin.apps.length || !admin.firestore) {
      return res.status(503).json({ error: "Auth not configured" });
    }

    const fs = admin.firestore();
    const senderUid = req.firebaseUid;

    // Resolve recipient via Firestore wallets mapping to Firebase UID
    const walletDoc = await fs
      .collection("wallets")
      .doc(String(recipientWalletAddress).toLowerCase())
      .get();
    if (!walletDoc.exists) {
      return res.status(404).json({ error: "Recipient wallet not found" });
    }
    const recipientUid = (walletDoc.data() || {}).uid;
    if (!recipientUid || typeof recipientUid !== "string") {
      return res
        .status(404)
        .json({ error: "Recipient user not found for wallet" });
    }

    if (recipientUid === senderUid) {
      return res.status(400).json({ error: "Cannot transfer to yourself" });
    }

    // Check for duplicate refId
    const transferHistoryRef = fs.collection("transferHistory").doc(refId);
    const existingTransfer = await transferHistoryRef.get();
    if (existingTransfer.exists) {
      console.log(`[Transfer] Duplicate refId detected: ${refId}`);
      // Return current sender balance (idempotent)
      const senderRewards = await fs.collection("userRewards").doc(senderUid).get();
      const balance = senderRewards.exists ? (senderRewards.data().totalRealmkin || 0) : 0;
      return res.json({ balance });
    }

    // Perform atomic debit/credit using Firestore transaction
    let newSenderBalance = 0;
    try {
      await fs.runTransaction(async (transaction) => {
        const senderRef = fs.collection("userRewards").doc(senderUid);
        const recipientRef = fs.collection("userRewards").doc(recipientUid);

        const senderDoc = await transaction.get(senderRef);
        const recipientDoc = await transaction.get(recipientRef);

        if (!senderDoc.exists) {
          throw new Error("Sender rewards not found");
        }

        const senderBalance = senderDoc.data().totalRealmkin || 0;
        if (amount > senderBalance) {
          throw new Error("Insufficient funds");
        }

        const recipientBalance = recipientDoc.exists ? (recipientDoc.data().totalRealmkin || 0) : 0;

        newSenderBalance = senderBalance - amount;
        const newRecipientBalance = recipientBalance + amount;

        // Update sender
        transaction.update(senderRef, {
          totalRealmkin: newSenderBalance,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update or create recipient
        if (recipientDoc.exists) {
          transaction.update(recipientRef, {
            totalRealmkin: newRecipientBalance,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(recipientRef, {
            totalRealmkin: newRecipientBalance,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // Record transfer history for idempotency
        transaction.set(transferHistoryRef, {
          senderUid,
          recipientUid,
          recipientWalletAddress,
          amount,
          refId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(`[Transfer] Success: ${amount} MKIN from ${senderUid} to ${recipientUid}`);
      res.json({ balance: newSenderBalance });
    } catch (err) {
      const msg = String(err.message || "").toLowerCase();
      if (msg.includes("insufficient")) {
        return res.status(400).json({ error: "Insufficient funds" });
      }
      throw err;
    }
  } catch (err) {
    console.error("POST /api/transfer error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ============================================================================
// Withdrawal Endpoints (Fee-based MKIN claiming to blockchain)
// ============================================================================

// POST /api/withdraw/initiate - Create fee transaction for withdrawal
app.post("/api/withdraw/initiate", verifyFirebase, async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;
    const userId = req.firebaseUid;

    console.log(`[Withdraw Initiate] User: ${userId}, Amount: ${amount}, Wallet: ${walletAddress}`);

    // Log withdrawal initiation (before validation to track all attempts)
    const logId = await withdrawalLogger.logInitiate(
      userId,
      walletAddress,
      amount,
      { feeAmountSol: 0, feeAmountUsd: 0.50, solPrice: 0 }, // Will update later
      req.ip,
      req.headers['user-agent']
    );

    // 1. Validate input
    if (!amount || !walletAddress) {
      return res.status(400).json({ error: "Missing amount or walletAddress" });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount - must be positive integer" });
    }

    // Minimum withdrawal check removed - users can withdraw any amount

    // 3. Check Firebase balance
    if (!admin.apps.length || !admin.firestore) {
      return res.status(503).json({ error: "Auth not configured" });
    }
    const fs = admin.firestore();
    const rewardsDoc = await fs.collection("userRewards").doc(userId).get();

    if (!rewardsDoc.exists) {
      return res.status(404).json({ error: "User rewards not found" });
    }

    const totalRealmkin = rewardsDoc.data()?.totalRealmkin || 0;

    if (amount > totalRealmkin) {
      return res.status(400).json({
        error: "Insufficient balance",
        available: totalRealmkin,
        requested: amount
      });
    }

    // 4. Get SOL price and calculate fee
    const { getSolPriceUSD } = await import('./utils/solPrice.js');
    const solPrice = await getSolPriceUSD();
    const feeInUsd = 0.50;
    const feeInSol = feeInUsd / solPrice;

    console.log(`[Withdraw Initiate] Fee: $${feeInUsd} = ${feeInSol.toFixed(6)} SOL (SOL price: $${solPrice})`);

    // Update log with fee details
    if (logId) {
      await sql`
        UPDATE withdrawal_transactions 
        SET fee_amount_sol = ${feeInSol}, 
            sol_price_usd = ${solPrice},
            fee_amount_usd = ${feeInUsd}
        WHERE id = ${logId}
      `;
    }

    // 5. Create SOL transfer transaction (user -> treasury)
    const { Connection, PublicKey, Transaction, SystemProgram } = await import('@solana/web3.js');
    const treasuryPubkey = new PublicKey(process.env.TREASURY_WALLET || '8w1dD5Von2GBTa9cVASeC2A9F3gRrCqHA7QPds5pfXsM');
    const userPubkey = new PublicKey(walletAddress);
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

    const connection = new Connection(solanaRpcUrl);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: treasuryPubkey,
        lamports: Math.floor(feeInSol * 1e9), // SOL to lamports
      })
    );

    // 6. Set recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    // 7. Serialize transaction for client to sign
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');

    console.log(`[Withdraw Initiate] Transaction created, waiting for user signature`);

    res.json({
      success: true,
      feeTransaction: serializedTx,
      feeAmountSol: feeInSol,
      feeAmountUsd: feeInUsd,
      solPrice: solPrice,
    });

  } catch (err) {
    console.error("[Withdraw Initiate] Error:", err);
    res.status(500).json({ error: "Failed to initiate withdrawal", details: err.message });
  }
});

// POST /api/withdraw/complete - Verify fee and send MKIN tokens
app.post("/api/withdraw/complete", verifyFirebase, async (req, res) => {
  try {
    const { feeSignature, amount, walletAddress } = req.body;
    const userId = req.firebaseUid;

    console.log(`[Withdraw Complete] User: ${userId}, Fee TX: ${feeSignature}`);

    // 1. Validate input
    if (!feeSignature || !amount || !walletAddress) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Minimum withdrawal check removed - users can withdraw any amount
    // Keeping validation for positive amounts only
    if (false) { // Disabled minimum check
      return res.status(400).json({
        error: ``,
      });
    }

    if (!admin.apps.length || !admin.firestore) {
      return res.status(503).json({ error: "Auth not configured" });
    }
    const fs = admin.firestore();

    // 2. Check if fee signature already used
    const usedFeesRef = fs.collection("usedWithdrawalFees").doc(feeSignature);
    const usedFeeDoc = await usedFeesRef.get();

    if (usedFeeDoc.exists) {
      console.warn(`[Withdraw Complete] Duplicate fee signature: ${feeSignature}`);
      return res.status(400).json({ error: "Fee signature already used" });
    }

    // 3. Verify fee transaction on-chain
    const { Connection } = await import('@solana/web3.js');
    // Use Helius for better rate limits (paid tier)
    const heliusApiKey = process.env.HELIUS_API_KEY;
    const solanaRpcUrl = heliusApiKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
      : "https://api.mainnet-beta.solana.com";
    const connection = new Connection(solanaRpcUrl);

    let txInfo;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      try {
        // Use rate limiter for transaction fetching
        txInfo = await heliusRateLimiter.execute(
          () => connection.getTransaction(feeSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          }),
          `withdrawal-verify-${userId.substring(0, 8)}`
        );
        
        if (txInfo) break; // Transaction found
        
        attempts++;
        console.log(`[Withdraw Complete] Attempt ${attempts}/${maxAttempts}: Transaction not found yet, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      } catch (err) {
        console.error(`[Withdraw Complete] Failed to fetch transaction (attempt ${attempts + 1}): ${err.message}`);
        attempts++;
        if (attempts >= maxAttempts) {
          return res.status(400).json({ error: "Fee transaction not found or not confirmed yet. Please wait and try again." });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!txInfo) {
      return res.status(400).json({ error: "Fee transaction not found after multiple attempts" });
    }

    if (txInfo.meta?.err) {
      return res.status(400).json({ error: "Fee transaction failed on-chain", details: txInfo.meta.err });
    }

    console.log(`[Withdraw Complete] Fee transaction verified: ${feeSignature}`);

    // 3.5 Find or create withdrawal log
    let logId = await withdrawalLogger.findByFeeSignature(feeSignature);
    if (!logId || !logId.id) {
      // Create log if not found (user may have skipped initiate endpoint)
      logId = { id: await withdrawalLogger.logInitiate(userId, walletAddress, amount, 
        { feeAmountSol: 0, feeAmountUsd: 0.50, solPrice: 0 }, null, null) };
    }

    // 4. Mark fee as used (prevent duplicate usage)
    await usedFeesRef.set({
      userId,
      amount,
      walletAddress,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. Deduct from Firebase totalRealmkin
    const rewardsRef = fs.collection("userRewards").doc(userId);

    let newBalance;
    try {
      await fs.runTransaction(async (transaction) => {
        const rewardsDoc = await transaction.get(rewardsRef);

        if (!rewardsDoc.exists) {
          throw new Error("User rewards not found");
        }

        const currentBalance = rewardsDoc.data()?.totalRealmkin || 0;

        if (amount > currentBalance) {
          throw new Error("Insufficient balance");
        }

        newBalance = currentBalance - amount;

        transaction.update(rewardsRef, {
          totalRealmkin: newBalance,
          totalClaimed: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(`[Withdraw Complete] Firebase balance updated: ${newBalance}`);
      
      // Log balance deduction
      const balanceBefore = newBalance + amount;
      if (logId && logId.id) {
        await withdrawalLogger.logFeeVerified(logId.id, feeSignature, balanceBefore, newBalance);
      }
    } catch (err) {
      console.error(`[Withdraw Complete] Firebase update failed: ${err.message}`);
      
      // Log failure
      if (logId && logId.id) {
        await withdrawalLogger.logFailed(logId.id, `Firebase update failed: ${err.message}`, 'FIREBASE_ERROR');
      }
      
      // Rollback: remove used fee marker
      try {
        await usedFeesRef.delete();
      } catch (deleteErr) {
        console.error(`[Withdraw Complete] Failed to rollback fee marker: ${deleteErr.message}`);
      }

      return res.status(500).json({
        error: "Failed to update balance",
        details: err.message,
        note: "Fee was charged but withdrawal failed. Please contact support."
      });
    }

    // 6. Send MKIN tokens to user wallet
    let mkinTxHash;
    try {
      const { sendMkinTokens } = await import('./utils/mkinTransfer.js');
      mkinTxHash = await sendMkinTokens(walletAddress, amount);
      console.log(`[Withdraw Complete] MKIN sent: ${mkinTxHash}`);
      
      // Log successful completion
      if (logId && logId.id) {
        await withdrawalLogger.logCompleted(logId.id, mkinTxHash);
      }
    } catch (err) {
      console.error(`[Withdraw Complete] MKIN transfer failed: ${err.message}`);
      
      // Log MKIN transfer failure (before refund attempt)
      if (logId && logId.id) {
        await withdrawalLogger.logFailed(logId.id, `MKIN transfer failed: ${err.message}`, 'MKIN_TRANSFER_ERROR');
      }

      // REFUND: Restore Firebase balance
      try {
        await fs.runTransaction(async (transaction) => {
          const rewardsDoc = await transaction.get(rewardsRef);
          const currentBal = rewardsDoc.exists ? (rewardsDoc.data().totalRealmkin || 0) : 0;
          
          transaction.update(rewardsRef, {
            totalRealmkin: currentBal + amount,
            totalClaimed: admin.firestore.FieldValue.increment(-amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        console.log(`[Withdraw Complete] Balance refunded after MKIN transfer failure`);
        
        // Update log to show refunded status
        if (logId && logId.id) {
          await withdrawalLogger.logRefunded(logId.id, 'Automatic refund after MKIN transfer failure');
        }

        return res.status(500).json({
          error: "Failed to send MKIN tokens",
          refunded: true,
          message: "Your balance has been refunded. The $0.50 fee was not refunded."
        });
      } catch (refundError) {
        console.error(`[Withdraw Complete] Refund failed: ${refundError.message}`);

        // Log for manual processing
        await fs.collection("withdrawalErrors").add({
          userId,
          amount,
          walletAddress,
          feeSignature,
          error: "Refund failed - requires manual intervention",
          mkinTransferError: err.message,
          refundError: refundError.message,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(500).json({
          error: "Critical error - contact support",
          message: "Please contact support with fee signature: " + feeSignature
        });
      }
    }

    // 7. Record in Firebase transactionHistory
    try {
      await fs.collection("transactionHistory").add({
        userId,
        walletAddress,
        type: "withdraw",
        amount,
        feeSignature,
        mkinTxHash,
        description: `Withdrew ${amount} MKIN (fee: $0.50)`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn(`[Withdraw Complete] Failed to record history: ${err.message}`);
      // Non-critical, continue
    }

    res.json({
      success: true,
      txHash: mkinTxHash,
      newBalance: newBalance,
      message: "Withdrawal successful"
    });

  } catch (err) {
    console.error("[Withdraw Complete] Error:", err);
    res.status(500).json({ error: "Failed to complete withdrawal", details: err.message });
  }
});

// ============================================================================
// Admin Endpoints
// ============================================================================

// Admin: adjust unified balance for any target (delta-based)
// body: { target: { firebaseUid?, walletAddress?, discordId? }, delta: int, reason?: string, refId: string }
app.post("/api/admin/adjust-firebase", verifyFirebase, async (req, res) => {
  try {
    if (!isAdminUid(req.firebaseUid))
      return res.status(403).json({ error: "Forbidden" });
    const { target = {}, delta, reason, refId } = req.body || {};
    if (!target || typeof target !== "object")
      return res.status(400).json({ error: "target required" });
    if (!Number.isInteger(delta))
      return res.status(400).json({ error: "delta must be integer" });
    if (!refId || typeof refId !== "string")
      return res.status(400).json({ error: "refId required" });
    const userId = await resolveUserIdByTarget(target);
    if (!userId)
      return res.status(404).json({ error: "target user not found" });
    const result = await sql`
            select public.apply_ledger_entry(${userId}::uuid, ${delta}::bigint, ${reason || "admin_adjustment"}, ${refId}) as balance
        `;
    const newBalance = result[0]?.balance ?? 0n;
    res.json({ balance: Number(newBalance) });
  } catch (err) {
    if (
      String(err.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return res.status(409).json({ error: "Duplicate refId" });
    }
    console.error("POST /api/admin/adjust-firebase error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: get unified balance for any target
// query: ?firebaseUid=... | ?walletAddress=... | ?discordId=...
app.get("/api/admin/user-balance", verifyFirebase, async (req, res) => {
  try {
    if (!isAdminUid(req.firebaseUid))
      return res.status(403).json({ error: "Forbidden" });
    const { firebaseUid, walletAddress, discordId } = req.query || {};
    const userId = await resolveUserIdByTarget({
      firebaseUid,
      walletAddress,
      discordId,
    });
    if (!userId)
      return res.status(404).json({ error: "target user not found" });
    const balRows =
      await sql`select balance from user_balances where user_id = ${userId}`;
    const balance = balRows[0]?.balance ?? 0n;
    res.json({ balance: Number(balance) });
  } catch (err) {
    console.error("GET /api/admin/user-balance error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: unlink all Discord connections (forces everyone to reconnect from frontend)
app.post("/api/admin/unlink-all-discord", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await sql`
            update user_links
            set discord_id = null
            where discord_id is not null
            returning user_id
        `;

    const unlinkedCount = result.length;
    console.log(`[admin] Unlinked ${unlinkedCount} Discord connections`);

    res.json({
      ok: true,
      unlinkedCount,
      message: `Successfully unlinked ${unlinkedCount} Discord connections. Users will need to reconnect from the frontend.`,
    });
  } catch (err) {
    console.error("POST /api/admin/unlink-all-discord error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: backfill unified balances for all existing links using legacy totals
app.post("/api/admin/backfill-balances", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const seedEnabled =
      String(process.env.SEED_BALANCE_FROM_LEGACY || "").toLowerCase() ===
      "true";
    if (!seedEnabled) {
      return res
        .status(400)
        .json({ error: "SEED_BALANCE_FROM_LEGACY is not enabled" });
    }

    const links =
      await sql`select user_id, firebase_uid, discord_id from user_links where discord_id is not null`;
    let updated = 0;
    for (const row of links) {
      try {
        // Prefer Firestore totalRealmkin for this firebase_uid
        let seedAmount = 0;
        try {
          if (admin?.firestore) {
            const fs = admin.firestore();
            const docRef = fs.collection("userRewards").doc(row.firebase_uid);
            const snap = await docRef.get();
            if (snap.exists) {
              const data = snap.data() || {};
              const totalRealmkin = Number(data.totalRealmkin || 0);
              if (!Number.isNaN(totalRealmkin) && totalRealmkin > seedAmount) {
                seedAmount = totalRealmkin;
              }
            }
          }
        } catch (e) {
          console.warn("Firestore backfill lookup failed:", e);
        }

        // Try wallet-based Firestore mapping if firebase_uid doc was 0/low
        try {
          const legacyLink = await sql`
                        select wallet_address from linked_wallets where user_id = ${row.discord_id}
                    `;
          const walletAddr = legacyLink[0]?.wallet_address;
          if (walletAddr && admin?.firestore) {
            const fs = admin.firestore();
            const walletDoc = await fs
              .collection("wallets")
              .doc(String(walletAddr).toLowerCase())
              .get();
            const mappedUid = walletDoc.exists
              ? (walletDoc.data() || {}).uid
              : null;
            if (mappedUid) {
              const walletRewardsSnap = await fs
                .collection("userRewards")
                .doc(mappedUid)
                .get();
              if (walletRewardsSnap.exists) {
                const wr = walletRewardsSnap.data() || {};
                const wrTotal = Number(wr.totalRealmkin || 0);
                if (!Number.isNaN(wrTotal) && wrTotal > seedAmount) {
                  seedAmount = wrTotal;
                }
              }
            }
          }
        } catch (e) {
          console.warn("Wallet-based Firestore backfill lookup failed:", e);
        }

        // Fallback to legacy if Firestore had 0
        if (seedAmount === 0) {
          const legacyRows = await sql`
                        select total_mkin_gained from linked_wallets where user_id = ${row.discord_id}
                    `;
          const legacyTotal = Number(legacyRows[0]?.total_mkin_gained || 0);
          seedAmount = !Number.isNaN(legacyTotal) ? legacyTotal : 0;
        }

        if (seedAmount <= 0) continue;
        const balRows =
          await sql`select balance from user_balances where user_id = ${row.user_id}`;
        if (!balRows[0]) {
          await sql`insert into user_balances (user_id, balance) values (${row.user_id}, ${seedAmount}) on conflict (user_id) do nothing`;
          updated++;
        } else if (seedAmount > Number(balRows[0].balance || 0)) {
          await sql`update user_balances set balance = ${seedAmount} where user_id = ${row.user_id}`;
          updated++;
        }
      } catch (e) {
        console.warn("Backfill failed for", row.user_id, e);
      }
    }
    res.json({ ok: true, updated });
  } catch (err) {
    console.error("POST /api/admin/backfill-balances error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ============================================================================
// Verification Session Endpoints (for frontend portal)
// ============================================================================

// GET /api/verification/session/:token - Fetch session details
app.get("/api/verification/session/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const session = await verificationSessionService.findSessionByToken(token);

    if (!session) {
      return res.status(404).json({ error: "Verification session not found." });
    }

    // Fetch contract summaries for this guild
    let contractSummaries = [];
    try {
      const rules = await guildVerificationConfigStore.listByGuild(
        session.guildId,
      );
      contractSummaries = rules.map((rule) => ({
        contractAddress: rule.contractAddress,
        requiredNftCount: rule.requiredNftCount,
        roleId: rule.roleId,
        roleName: rule.roleName,
        ownedCount: 0, // Will be populated after signature verification
        meetsRequirement: false,
      }));
    } catch (err) {
      console.warn("[verification] Failed to load contract rules:", err);
    }

    res.json({
      id: session.id,
      discordId: session.discordId,
      guildId: session.guildId,
      walletAddress: session.walletAddress,
      status: session.status,
      expiresAt: session.expiresAt,
      verifiedAt: session.verifiedAt,
      createdAt: session.createdAt,
      message: session.message,
      username: session.username,
      contractSummaries,
    });
  } catch (err) {
    console.error(
      "[verification] GET /api/verification/session/:token error:",
      err,
    );
    if (err instanceof VerificationSessionError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/verification/session/:token/signature - Submit wallet signature
app.post("/api/verification/session/:token/signature", async (req, res) => {
  try {
    const { token } = req.params;
    const { signature, walletAddress, username } = req.body;

    console.log(
      "[verification] POST /signature - token:",
      token?.slice(0, 8),
      "walletAddress:",
      walletAddress,
    );

    if (!signature) {
      return res.status(400).json({ error: "Signature is required." });
    }

    const result = await verificationSessionService.verifySession(
      token,
      signature,
      {
        walletAddress,
        username,
        client, // Pass Discord client
      }
    );

    // Send embed DM confirmation
    try {
      const { EmbedBuilder } = await import("discord.js");

      // Check for special roles that were assigned
      const specialRoles = [];
      if (global.periodicVerificationService && result.verification.nfts) {
        // Get eligible special roles by checking NFTs against configured special roles
        const specialRolesMap = global.periodicVerificationService.specialRoles || new Map();
        const eligibleSpecialRoles = [];
        
        // Check each NFT for matching special roles
        for (const nft of result.verification.nfts) {
          // Check if NFT has class attribute
          if (nft.class) {
            const specialRole = specialRolesMap.get(nft.class);
            if (specialRole) {
              eligibleSpecialRoles.push(specialRole);
            }
          }
          
          // Check NFT attributes for special roles
          if (nft.content?.metadata?.attributes) {
            for (const attr of nft.content.metadata.attributes) {
              if (attr.trait_type === 'Class' && attr.value) {
                const specialRole = specialRolesMap.get(attr.value);
                if (specialRole) {
                  eligibleSpecialRoles.push(specialRole);
                }
              }
            }
          }
        }
        
        specialRoles.push(...eligibleSpecialRoles.map((r) => r.roleName));
      }

      const embed = new EmbedBuilder()
      embed.setColor(result.verification.isVerified ? "#DA9C2F" : "#999999");
      embed.setTitle(
        result.verification.isVerified
          ? "✅ Verification Complete!"
          : "⚠️ Verification Complete",
      );
      embed.setDescription(
        result.verification.isVerified
          ? `Your wallet has been successfully verified!`
          : `Your wallet has been verified, but you don't own any required NFTs yet.`,
      );
      embed.addFields(
        {
          name: "Wallet Address",
          value: `\`${result.verification.walletAddress}\``,
          inline: false,
        },
        {
          name: "NFTs Found",
          value: `${result.verification.nftCount}`,
          inline: true,
        },
        {
          name: "Roles Assigned",
          value:
            assignedRoles.length > 0 ? assignedRoles.join(", ") : "None",
          inline: true,
        },
      );
      embed.setFooter({ text: "Realmkin Gatekeeper" });
      embed.setTimestamp();

      // Add special roles field if any were assigned
      if (specialRoles.length > 0) {
        embed.addFields({
          name: "👑 Special Roles",
          value: specialRoles.join(", "),
          inline: false,
        });
      }

      await member.send({ embeds: [embed] });
      console.log(
        `[verification] Sent verification embed to ${member.user.tag}`,
      );
    } catch (dmErr) {
      console.warn(
        "[verification] Could not send DM to user:",
        dmErr.message,
      );
    }

    res.json(result);
  } catch (err) {
    console.error(
      "[verification] POST /api/verification/session/:token/signature error:",
      err,
    );
    console.error("[verification] Error stack:", err.stack);
    if (err instanceof VerificationSessionError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res
      .status(500)
      .json({ error: "Internal server error.", details: err.message });
  }
});

// Auto verification: create session and verify immediately after Discord linking
// body: { discordId?, walletAddress?, username?, guildId? }
app.post("/api/verification/auto", verifyFirebase, async (req, res) => {
  try {
    const {
      discordId: bodyDiscordId,
      walletAddress: bodyWalletAddress,
      username,
      guildId: bodyGuildId,
    } = req.body || {};

    // Resolve discordId: prefer body then linkage by firebase_uid
    let discordId = bodyDiscordId;
    if (!discordId) {
      try {
        const rows =
          await sql`select discord_id from user_links where firebase_uid = ${req.firebaseUid}`;
        discordId = rows[0]?.discord_id || null;
      } catch (e) {
        console.warn(
          "[verification:auto] Failed to query user_links:",
          e?.message || e,
        );
      }
    }
    if (!discordId) {
      return res
        .status(400)
        .json({ error: "discordId not linked to this user" });
    }

    // Resolve guildId from body or env
    const guildId = bodyGuildId || process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      return res.status(400).json({
        error: "Missing guildId (set DISCORD_GUILD_ID or provide in body)",
      });
    }

    // Resolve walletAddress: prefer body then Firestore wallets where uid == current user
    let walletAddress = bodyWalletAddress;
    if (!walletAddress) {
      try {
        if (admin?.firestore) {
          const fs = admin.firestore();
          
          // First try: look in wallets collection
          const qSnap = await fs
            .collection("wallets")
            .where("uid", "==", req.firebaseUid)
            .limit(1)
            .get();
          if (!qSnap.empty) {
            // Document id is the wallet address in current schema
            walletAddress = qSnap.docs[0].id;
            console.log("[verification:auto] Found wallet from wallets collection:", walletAddress);
          }
          
          // Second try: look in users collection
          if (!walletAddress) {
            const userDoc = await fs.collection("users").doc(req.firebaseUid).get();
            if (userDoc.exists && userDoc.data()?.walletAddress) {
              walletAddress = userDoc.data().walletAddress;
              console.log("[verification:auto] Found wallet from users collection:", walletAddress);
            }
          }
        }
      } catch (e) {
        console.warn(
          "[verification:auto] Firestore wallet lookup failed:",
          e?.message || e,
        );
      }
    }

    // Log wallet address first, no matter what
    console.log("[verification:auto] ===== WALLET ADDRESS DEBUG =====");
    console.log("[verification:auto] Raw walletAddress:", walletAddress);
    console.log("[verification:auto] Type:", typeof walletAddress);
    console.log("[verification:auto] Length:", walletAddress ? walletAddress.length : "null");
    console.log("[verification:auto] Firebase UID:", req.firebaseUid);
    console.log("[verification:auto] ================================");

    if (!walletAddress) {
      return res
        .status(400)
        .json({ error: "walletAddress required (connect a wallet first)" });
    }

    // Validate wallet address format before sending to verification
    // Use proper Solana address validation
    let validatedWallet = walletAddress;
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      console.warn("[verification:auto] Invalid wallet address format, attempting recovery...");
      
      // Try to recover from Firestore - fetch the original case-sensitive address
      try {
        if (admin?.firestore) {
          const fs = admin.firestore();
          const walletLower = walletAddress.toLowerCase();
          
          // Priority 1: Look in wallets collection
          const walletDoc = await fs.collection("wallets").doc(walletLower).get();
          if (walletDoc.exists && walletDoc.data()?.walletAddress) {
            validatedWallet = walletDoc.data().walletAddress;
            console.log("[verification:auto] Recovered wallet from wallets collection:", validatedWallet);
          } 
          // Priority 2: Look in users collection
          else {
            const userDoc = await fs.collection("users").doc(req.firebaseUid).get();
            if (userDoc.exists && userDoc.data()?.walletAddress) {
              validatedWallet = userDoc.data().walletAddress;
              console.log("[verification:auto] Recovered wallet from users collection:", validatedWallet);
            }
          }
          
          // Priority 3: Look in userRewards collection
          if (validatedWallet === walletAddress) {
            const userRewardsDoc = await fs.collection("userRewards").doc(req.firebaseUid).get();
            if (userRewardsDoc.exists && userRewardsDoc.data()?.walletAddress) {
              validatedWallet = userRewardsDoc.data().walletAddress;
              console.log("[verification:auto] Recovered wallet from userRewards collection:", validatedWallet);
            }
          }
          
          // Priority 4: Look in userStats collection
          if (validatedWallet === walletAddress) {
            const userStatsDoc = await fs.collection("userStats").doc(req.firebaseUid).get();
            if (userStatsDoc.exists && userStatsDoc.data()?.walletAddress) {
              validatedWallet = userStatsDoc.data().walletAddress;
              console.log("[verification:auto] Recovered wallet from userStats collection:", validatedWallet);
            }
          }
        }
      } catch (e) {
        console.warn("[verification:auto] Failed to recover wallet:", e?.message || e);
      }
      
      // Validate the recovered address
      try {
        new PublicKey(validatedWallet);
      } catch (error) {
        console.error("[verification:auto] Could not recover valid wallet address:", error.message);
        return res
          .status(400)
          .json({ error: "Invalid wallet address format - unable to recover" });
      }
      
      console.log("[verification:auto] Successfully recovered and validated wallet");
    }

    // Create session and immediately verify (use validated wallet in original case)
    const session = await verificationSessionService.createSession({
      discordId,
      guildId,
      walletAddress: validatedWallet, // Use validated wallet address in original case
      username: username || null,
    });

    const result = await verificationSessionService.verifySession(
      session.token,
      "auto",
      {
        walletAddress: validatedWallet, // Use validated wallet address in original case
        username,
        client,
      },
    );

    console.log(
      "[verification:auto] Completed for discordId",
      discordId,
      "guild",
      guildId,
      "wallet",
      validatedWallet,
    );

    // Send invite link via DM if verification succeeded
    if (result.verification && client) {
      try {
        const user = await client.users.fetch(discordId);
        const guild = await client.guilds.fetch(guildId);
        const inviteLink =
          process.env.DISCORD_INVITE_URL || `https://discord.gg/your-server`;

        // Check if user is in the guild
        let member = null;
        try {
          member = await guild.members.fetch(discordId);
        } catch (e) {
          console.warn(`[verification:auto] User ${discordId} not in guild yet, waiting for them to join...`);
        }

        // If user not in guild, wait for them to join (up to 5 minutes)
        if (!member) {
          console.log(`[verification:auto] Waiting for user ${discordId} to join guild ${guildId}...`);
          const maxWaitTime = 5 * 60 * 1000; // 5 minutes
          const checkInterval = 5 * 1000; // Check every 5 seconds
          const startTime = Date.now();

          while (Date.now() - startTime < maxWaitTime) {
            try {
              member = await guild.members.fetch(discordId);
              console.log(`[verification:auto] User ${discordId} has joined the guild!`);
              break;
            } catch (e) {
              // User hasn't joined yet, wait and retry
              await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
          }

          if (!member) {
            console.warn(`[verification:auto] User ${discordId} did not join within 5 minutes, skipping DM`);
            return res.status(200).json({
              success: true,
              message: "Verification completed. User will receive DM once they join the server.",
            });
          }
        }

        const verified = Boolean(result.verification.isVerified);
        const contracts = Array.isArray(result.verification.contracts)
          ? result.verification.contracts
          : [];
        const assignedRoles = contracts
          .filter((c) => c?.meetsRequirement && (c.roleName || c.roleId))
          .map((c) => c.roleName || `Role ${c.roleId}`);
        const rolesValue = assignedRoles.length
          ? assignedRoles.map((r) => `• ${r}`).join("\n")
          : "No roles assigned";

        const shortWallet = (validatedWallet || "").length > 8
          ? `${validatedWallet.slice(0, 4)}…${validatedWallet.slice(-4)}`
          : validatedWallet || "unknown";

        const embed = {
          color: verified ? 0x00ff00 : 0xffcc00,
          title: verified
            ? "✅ Verification Successful!"
            : "⚠️ Verification Completed",
          description: verified
            ? `Your wallet has been verified in **${guild.name}**.`
            : `We completed a check in **${guild.name}**, but you didn't meet the role requirements yet.`,
          fields: [
            { name: "Wallet", value: shortWallet, inline: true },
            {
              name: "NFTs Found",
              value: String(result.verification.nftCount || 0),
              inline: true,
            },
            { name: "Roles Assigned", value: rolesValue, inline: false },
            {
              name: "Weekly Updates",
              value: "Gatekeeper will update at the end of every mine week with increases in claimable amount, mining rate, and more.",
              inline: false,
            },
          ],
          footer: {
            text: "You're now tracked by periodic verification for ongoing role updates.",
          },
          timestamp: new Date().toISOString(),
        };

        await user.send({ embeds: [embed] });
        console.log(`[verification:auto] Sent verification DM to ${user.tag}`);
        
        // Immediately assign class-based roles if client is provided
        if (global.periodicVerificationService) {
          try {
            // Get contract rules for this guild
            let contractRules = [];
            try {
              contractRules = await guildVerificationConfigStore.listByGuild(guildId);
            } catch (error) {
              console.warn(`[verification:auto] Failed to load contract rules for immediate role assignment:`, error.message);
            }
            
            // Update class-based roles immediately
            if (contractRules.length > 0) {
              await global.periodicVerificationService.updateClassBasedRoles(
                member, 
                result.verification.nfts, 
                username || session.username || discordId,
                contractRules
              );
              
              console.log(`[verification:auto] Immediately assigned class-based roles for user ${discordId}`);
            }
          } catch (roleError) {
            console.error(`[verification:auto] Failed to assign roles immediately:`, roleError.message);
            // Don't throw - role assignment failure shouldn't block verification
          }
        }
      } catch (dmErr) {
        console.warn(
          "[verification:auto] Could not send invite DM:",
          dmErr?.message || dmErr,
        );
        // Fallback: post in welcome channel if configured
        try {
          const channelId = process.env.DISCORD_WELCOME_CHANNEL_ID;
          if (channelId) {
            const ch = await client.channels.fetch(channelId);
            if (ch && ch.isTextBased()) {
              await ch.send(
                `<@${discordId}> ✅ Verification successful! If your DMs are disabled, enable them to receive bot messages.`,
              );
              console.log(
                `[verification:auto] Posted fallback welcome in channel ${channelId}`,
              );
            }
          }
        } catch (fallbackErr) {
          console.warn(
            "[verification:auto] Fallback channel message failed:",
            fallbackErr?.message || fallbackErr,
          );
        }
      }
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[verification:auto] error:", err);
    if (err instanceof VerificationSessionError) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Start HTTP server on fixed port 3001 (do not rely on env to avoid conflicts)
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`HTTP API listening on :${PORT}`);
});
