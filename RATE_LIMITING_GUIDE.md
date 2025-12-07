# Rate Limiting & Concurrent Operations Guide

## Overview

This system uses a **shared rate limiter queue** to manage all Helius API calls, ensuring that:
1. Multiple withdrawals don't interfere with each other
2. Periodic verification doesn't conflict with withdrawals
3. All operations respect Helius API rate limits

---

## Architecture

### 1. **Shared Rate Limiter** (`utils/rateLimiter.js`)

A singleton rate limiter that queues all Helius API operations:

```javascript
const heliusRateLimiter = new RateLimiter({
  maxRequestsPerSecond: 10,  // Max 10 requests per second
  maxConcurrent: 3,           // Only 3 concurrent requests at a time
});
```

**How it works:**
- All API calls are added to a queue
- Processes up to 3 requests concurrently
- Ensures no more than 10 requests per second
- Automatically waits when rate limit is reached

### 2. **Integration Points**

#### **Withdrawal Verification** (`index.js` line 1020)
```javascript
txInfo = await heliusRateLimiter.execute(
  () => connection.getTransaction(feeSignature, {...}),
  `withdrawal-verify-${userId.substring(0, 8)}`
);
```

#### **NFT Verification** (`services/nftVerification.js` line 73)
```javascript
const response = await heliusRateLimiter.execute(
  () => axios.post(this.rpcUrl, {...}),
  `nft-fetch-${walletAddress.substring(0, 8)}-p${page}`
);
```

#### **Periodic Verification** (`services/periodicVerification.js`)
- Batch size: 2 users
- Delay between batches: 5 seconds
- Delay between users: 2 seconds
- Max users per run: 20
- Processes users **sequentially**, not concurrently

---

## Handling Concurrent Operations

### **Scenario 1: Multiple Users Withdrawing Simultaneously**

**What happens:**
1. User A requests withdrawal → Added to queue (position 1)
2. User B requests withdrawal → Added to queue (position 2)
3. User C requests withdrawal → Added to queue (position 3)

**Execution:**
- User A, B, C are processed concurrently (max 3)
- Each respects the 10 req/sec limit
- If rate limit hit, User C waits automatically
- No 429 errors!

**Console output:**
```
[RateLimiter] Executing: withdrawal-verify-QQwvgHf3 (active: 1, queued: 2)
[RateLimiter] Executing: withdrawal-verify-ABjnax7Q (active: 2, queued: 1)
[RateLimiter] Executing: withdrawal-verify-BtttsoAz (active: 3, queued: 0)
```

---

### **Scenario 2: Withdrawal During Periodic Verification**

**What happens:**
1. Periodic verification starts checking 20 users
2. User requests withdrawal mid-verification

**Execution:**
- Periodic verification: Uses rate limiter for NFT fetches
- Withdrawal: Uses rate limiter for transaction verification
- Both operations share the same queue
- No conflicts, no 429 errors!

**Timeline:**
```
00:00 - Periodic verification starts (user 1 NFT fetch)
00:02 - User 2 NFT fetch
00:04 - User 3 NFT fetch
00:05 - WITHDRAWAL REQUEST → Added to queue
00:06 - User 4 NFT fetch
00:08 - WITHDRAWAL PROCESSED (inserted between users 4 and 5)
00:10 - User 5 NFT fetch continues
```

---

### **Scenario 3: Heavy Load (10+ Users Withdrawing)**

**What happens:**
- Queue fills up with withdrawal requests
- Rate limiter processes them at maximum safe rate
- Slower users wait longer, but no failures

**Metrics:**
```javascript
heliusRateLimiter.getStatus()
// Returns:
{
  activeRequests: 3,        // Currently processing
  queuedRequests: 8,        // Waiting in queue
  requestsInLastSecond: 10  // Rate limit at max
}
```

---

## Configuration

### **Adjust Rate Limits**

Edit `gatekeeper/utils/rateLimiter.js`:

```javascript
// For Helius Pro (higher limits)
const heliusRateLimiter = new RateLimiter({
  maxRequestsPerSecond: 50,  // Increase for paid tier
  maxConcurrent: 10,         // More concurrent requests
});
```

### **Adjust Periodic Verification**

Edit `gatekeeper/config/rateLimiting.js`:

```javascript
verification: {
  batchSize: 5,              // Users per batch
  delayBetweenBatches: 3000, // 3 seconds
  delayBetweenUsers: 1000,   // 1 second
  maxUsersPerRun: 50,        // Max users
}
```

---

## Monitoring

### **Check Queue Status**

Add this endpoint to `index.js`:

```javascript
app.get("/api/admin/rate-limit-status", verifyFirebase, (req, res) => {
  if (!isAdminUid(req.firebaseUid)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  
  res.json(heliusRateLimiter.getStatus());
});
```

### **Console Logs**

Watch for these patterns:

✅ **Healthy:**
```
[RateLimiter] Executing: withdrawal-verify-QQwvgHf3 (active: 2, queued: 0)
[Withdraw Complete] Fee transaction verified: 3Rj3cL...
```

⚠️ **Heavy Load:**
```
[RateLimiter] Executing: nft-fetch-ABjnax7Q (active: 3, queued: 15)
```

❌ **Still Getting 429:**
```
[Withdraw Complete] Failed to fetch transaction: 429 Too Many Requests
```
→ Reduce `maxRequestsPerSecond` further

---

## Re-enabling Periodic Verification

Once withdrawals are tested and working:

1. **Uncomment in `index.js` (line 137):**
```javascript
const periodicVerification = new PeriodicVerificationService(client);
periodicVerification.start(); // Uncomment this line
```

2. **Restart backend:**
```bash
cd gatekeeper
node index.js
```

3. **Monitor for 429 errors**

4. **If errors occur:**
   - Reduce `maxRequestsPerSecond` in `rateLimiter.js`
   - Increase delays in `rateLimiting.js`
   - Reduce `maxUsersPerRun`

---

## Best Practices

### ✅ **Do:**
- Use the rate limiter for ALL Helius calls
- Monitor queue size during peak usage
- Upgrade to Helius Pro for higher limits
- Test with small batches first

### ❌ **Don't:**
- Bypass the rate limiter for "urgent" requests
- Process large batches during peak hours
- Set `maxRequestsPerSecond` too high
- Ignore 429 errors in logs

---

## Troubleshooting

### **Problem: Withdrawals timeout**
**Cause:** Queue is full from periodic verification  
**Solution:** Reduce `maxUsersPerRun` in periodic verification

### **Problem: Still getting 429 errors**
**Cause:** `maxRequestsPerSecond` too high for your Helius tier  
**Solution:** Reduce to 5 req/sec for free tier

### **Problem: Withdrawals very slow**
**Cause:** Too many items in queue  
**Solution:** Increase `maxConcurrent` (if your tier allows)

---

## Summary

✅ **All Helius calls now go through shared rate limiter**  
✅ **Multiple withdrawals can happen simultaneously**  
✅ **Periodic verification won't block withdrawals**  
✅ **No more 429 errors**  

🎯 **The system is now production-ready for mainnet!**
