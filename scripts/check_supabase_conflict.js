import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import dotenv from "dotenv";

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({
  path: path.resolve(__dirname, "../../gatekeeper/.env"),
  override: true,
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const TARGET_WALLET = "A2d1n915X2zyePJ1CL2U9TbhWjFKnGGKyJvpEdBLZ2QZ";

async function checkConflict() {
  console.log(`🔍 Checking Supabase tables for wallet: ${TARGET_WALLET}`);

  try {
    // 1. Check 'users' table
    console.log("\n--- 1. Checking 'users' table ---");
    const users =
      await sql`select * from users where wallet_address ILIKE ${TARGET_WALLET}`;
    if (users.length > 0) {
      console.log("✅ Found in 'users' table:");
      console.log(users);
    } else {
      console.log("❌ Not found in 'users' table.");
    }

    // 2. Check 'linked_wallets' table (Legacy?)
    console.log("\n--- 2. Checking 'linked_wallets' table ---");
    const linked =
      await sql`select * from linked_wallets where wallet_address ILIKE ${TARGET_WALLET}`;
    if (linked.length > 0) {
      console.log("✅ Found in 'linked_wallets' table:");
      console.log(linked);
    } else {
      console.log("❌ Not found in 'linked_wallets' table.");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await sql.end();
  }
}

checkConflict();
