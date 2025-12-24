import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

const router = express.Router();

/**
 * GET /leaderboard/mining
 * Returns top miners based on total claimed rewards or current staked amount
 */
router.get("/mining", async (req, res) => {
  try {
    const { 
      type = "rewards", // "rewards" or "staked" 
      limit = 10,
      period = "all" // "all", "weekly", "daily"
    } = req.query;

    const db = getFirestore();
    let leaderboard = [];

    if (type === "rewards") {
      // Top miners by total claimed SOL rewards
      const positionsRef = db.collection("staking_positions");
      const snapshot = await positionsRef
        .where("total_claimed_sol", ">", 0)
        .orderBy("total_claimed_sol", "desc")
        .limit(parseInt(limit))
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = doc.id;

        // Get user details from userRewards collection
        const userDoc = await db.collection("userRewards").doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // Simple username display - just use display name or User-{id}
        let displayName = userData.displayName || userData.username || `User${userId.slice(-4)}`;

        leaderboard.push({
          userId,
          username: displayName,
          rank: leaderboard.length + 1,
          value: data.total_claimed_sol || 0,
          valueLabel: `${(data.total_claimed_sol || 0).toFixed(6)} SOL`,
          metadata: {
            principalAmount: data.principal_amount || 0,
            totalAccruedSol: data.total_accrued_sol || 0,
            stakeStartTime: data.stake_start_time?.toMillis() || null,
            lastStakeTime: data.last_stake_time?.toMillis() || null,
            activeBoosters: data.active_boosters || [],
            boosterMultiplier: calculateBoosterMultiplier(data.active_boosters || [])
          },
          breakdown: {
            "Staked": `${(data.principal_amount || 0).toLocaleString()} MKIN`,
            "Claimed": `${(data.total_claimed_sol || 0).toFixed(6)} SOL`
          }
        });
      }
    } else if (type === "staked") {
      // Top miners by current staked amount
      const positionsRef = db.collection("staking_positions");
      const snapshot = await positionsRef
        .where("principal_amount", ">", 0)
        .orderBy("principal_amount", "desc")
        .limit(parseInt(limit))
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = doc.id;

        // Get user details
        const userDoc = await db.collection("userRewards").doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        let displayName = userData.displayName || userData.username || `User${userId.slice(-4)}`;

        leaderboard.push({
          userId,
          username: displayName,
          rank: leaderboard.length + 1,
          value: data.principal_amount || 0,
          valueLabel: `${(data.principal_amount || 0).toLocaleString()} MKIN`,
          metadata: {
            totalClaimedSol: data.total_claimed_sol || 0,
            totalAccruedSol: data.total_accrued_sol || 0,
            pendingRewards: data.pending_rewards || 0,
            stakeStartTime: data.stake_start_time?.toMillis() || null,
            lastStakeTime: data.last_stake_time?.toMillis() || null,
            activeBoosters: data.active_boosters || [],
            boosterMultiplier: calculateBoosterMultiplier(data.active_boosters || [])
          },
          breakdown: {
            "Staked": `${(data.principal_amount || 0).toLocaleString()} MKIN`,
            "Rewards": `${(data.total_claimed_sol || 0).toFixed(6)} SOL`
          }
        });
      }
    }

    // Add period filtering if needed (for weekly/daily leaderboards)
    if (period === "weekly" || period === "daily") {
      const now = new Date();
      const cutoffTime = new Date();
      
      if (period === "weekly") {
        cutoffTime.setDate(now.getDate() - 7);
      } else if (period === "daily") {
        cutoffTime.setDate(now.getDate() - 1);
      }

      // Filter entries based on activity in the period
      leaderboard = leaderboard.filter(entry => {
        const lastActivity = entry.metadata.lastStakeTime || entry.metadata.stakeStartTime;
        return lastActivity && lastActivity > cutoffTime.getTime();
      });

      // Re-rank after filtering
      leaderboard.forEach((entry, index) => {
        entry.rank = index + 1;
      });
    }

    res.json({
      success: true,
      leaderboard,
      metadata: {
        type,
        period,
        totalEntries: leaderboard.length,
        lastUpdated: new Date().toISOString(),
        criteria: type === "rewards" ? "Total SOL Claimed" : "Current MKIN Staked"
      }
    });

  } catch (error) {
    console.error("Error fetching mining leaderboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch mining leaderboard",
      message: error.message
    });
  }
});

/**
 * GET /leaderboard/mining/top3
 * Returns top 3 miners for quick display
 */
router.get("/mining/top3", async (req, res) => {
  try {
    const { type = "rewards" } = req.query;

    // Use the main mining endpoint but limit to 3
    const response = await new Promise((resolve, reject) => {
      // Simulate internal API call
      const mockReq = { query: { type, limit: 3, period: "all" } };
      const mockRes = {
        json: (data) => resolve(data),
        status: (code) => ({ json: (data) => reject(new Error(data.message)) })
      };

      // Call the main endpoint logic
      router.handle({ method: "GET", url: "/mining", query: mockReq.query }, mockRes);
    });

    if (response.success) {
      // Add special formatting for top 3
      const top3 = response.leaderboard.slice(0, 3).map((entry, index) => ({
        ...entry,
        medal: ["🥇", "🥈", "🥉"][index],
        tier: ["1st", "2nd", "3rd"][index]
      }));

      res.json({
        success: true,
        top3,
        metadata: {
          ...response.metadata,
          displayType: "top3"
        }
      });
    } else {
      throw new Error("Failed to fetch leaderboard data");
    }

  } catch (error) {
    console.error("Error fetching top 3 miners:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch top 3 miners",
      message: error.message
    });
  }
});

/**
 * Helper: Calculate Booster Multiplier
 * Same logic as in stakingService.js
 */
function calculateBoosterMultiplier(activeBoosters = []) {
  if (!activeBoosters || activeBoosters.length === 0) {
    return 1.0;
  }

  let maxMultiplier = 1.0;

  for (const booster of activeBoosters) {
    const type = booster.type?.toLowerCase() || "";

    if (type.includes("realmkin_miner") || type.includes("miner")) {
      maxMultiplier = Math.max(maxMultiplier, 2.0); // Top tier
    } else if (type.includes("customized") || type.includes("custom")) {
      maxMultiplier = Math.max(maxMultiplier, 1.5); // Mid tier
    } else if (type.includes("realmkin") || type.includes("1/1")) {
      maxMultiplier = Math.max(maxMultiplier, 1.25); // Lowest tier
    }
  }

  return maxMultiplier;
}

export default router;