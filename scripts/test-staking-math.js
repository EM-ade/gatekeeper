/**
 * Staking Math Test Script
 * Simulates the "MasterChef" algorithm to ensure mathematical correctness.
 *
 * Logic:
 * 1. Global AccRewardPerShare accumulates rewards over time per unit of stake.
 * 2. User Reward = (UserStake * AccRewardPerShare) - RewardDebt.
 * 3. RewardDebt = UserStake * AccRewardPerShare (at time of entry/update).
 *
 * We simulate:
 * - Pool initialized.
 * - User A stakes.
 * - Time passes.
 * - User B stakes.
 * - Time passes.
 * - User A claims.
 * - User A stakes more.
 * - Check if Total Claimed + Total Pending <= Total Rewards Emitted.
 */

const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
const REWARD_POOL = 1000; // 1000 SOL in pool
const PRECISION = 1e12; // Multiplier to simulate blockchain precision

let pool = {
  totalStaked: 0,
  accRewardPerShare: 0,
  lastTime: 0,
  rewardPool: REWARD_POOL,
};

let users = {};

function log(msg) {
  console.log(`[${currentTime}s] ${msg}`);
}

let currentTime = 0;

function updatePool(timestamp) {
  const dt = timestamp - pool.lastTime;
  if (dt <= 0) return;

  if (pool.totalStaked === 0) {
    pool.lastTime = timestamp;
    return;
  }

  // Calculate Rewards using the exact Logic: (Pool * dt) / YearSeconds
  const rewards = (pool.rewardPool * dt) / SECONDS_IN_YEAR;

  // Update Acc
  pool.accRewardPerShare += rewards / pool.totalStaked;

  // Deduct from pool (Conceptual virtual allocation)
  pool.rewardPool -= rewards;
  pool.lastTime = timestamp;

  log(
    `Pool Update: Emitted ${rewards.toFixed(
      6
    )} SOL. Acc: ${pool.accRewardPerShare.toFixed(9)}`
  );
}

function stake(userId, amount) {
  updatePool(currentTime);

  let user = users[userId] || { principal: 0, debt: 0, pending: 0, claimed: 0 };

  if (user.principal > 0) {
    const pending = user.principal * pool.accRewardPerShare - user.debt;
    user.pending += pending;
  }

  user.principal += amount;
  user.debt = user.principal * pool.accRewardPerShare;
  pool.totalStaked += amount;
  users[userId] = user;

  log(`User ${userId} Staked ${amount}. Principal: ${user.principal}`);
}

function claim(userId) {
  updatePool(currentTime);
  let user = users[userId];
  if (!user) return;

  const pending = user.principal * pool.accRewardPerShare - user.debt;
  user.pending += pending;

  const amount = user.pending;
  user.claimed += amount;
  user.pending = 0;
  user.debt = user.principal * pool.accRewardPerShare;

  log(`User ${userId} Claimed ${amount.toFixed(6)}.`);
  return amount;
}

function unstake(userId, amount) {
  updatePool(currentTime);
  let user = users[userId];
  if (!user || user.principal < amount) throw new Error("Insufficient funds");

  const pending = user.principal * pool.accRewardPerShare - user.debt;
  user.pending += pending;

  user.principal -= amount;
  user.debt = user.principal * pool.accRewardPerShare;
  pool.totalStaked -= amount;

  log(`User ${userId} Unstaked ${amount}.`);
}

// ==== SIMULATION ====

console.log("Starting Simulation...");

// T=0: Init
currentTime = 0;
pool.lastTime = 0;

// T=100: User A Stakes 100
currentTime = 100;
stake("A", 100);

// T=200: 100s passed. Reward Rate approx constant (Pool~1000).
// Rewards ~ 1000 * 100 / 31536000 = 0.00317 SOL
currentTime = 200;
// Check pending A (just peek)
updatePool(currentTime);
let pendingA = users["A"].principal * pool.accRewardPerShare - users["A"].debt;
log(`User A Pending (Peek): ${pendingA.toFixed(6)}`);

// T=200: User B Stakes 300 (Total 400)
stake("B", 300);

// T=400: 200s passed.
// A has 1/4 share, B has 3/4 share.
currentTime = 400;
claim("A");

// T=500: A unstakes all
currentTime = 500;
unstake("A", 100);

// Verify Math
const totalEmitted = REWARD_POOL - pool.rewardPool;
const totalClaimed = Object.values(users).reduce((a, b) => a + b.claimed, 0);
const totalPending = Object.values(users).reduce(
  (a, b) => a + (b.principal * pool.accRewardPerShare - b.debt + b.pending),
  0
);

console.log("\n=== RESULTS ===");
console.log(`Initial Pool: ${REWARD_POOL}`);
console.log(`Final Pool: ${pool.rewardPool.toFixed(6)}`);
console.log(`Total Emitted From Pool: ${totalEmitted.toFixed(6)}`);
console.log(`Total Claimed by Users: ${totalClaimed.toFixed(6)}`);
console.log(`Total Pending for Users: ${totalPending.toFixed(6)}`);
console.log(
  `Sum (Claimed + Pending): ${(totalClaimed + totalPending).toFixed(6)}`
);
console.log(
  `Difference (Leak check): ${(
    totalEmitted -
    (totalClaimed + totalPending)
  ).toFixed(9)}`
);

if (Math.abs(totalEmitted - (totalClaimed + totalPending)) < 0.000001) {
  console.log("✅ Math Check PASSED");
} else {
  console.error("❌ Math Check FAILED");
}
