# Revenue Distribution System - Testing Guide

## ✅ Step 1: Environment Setup (COMPLETED)

You need to add these environment variables to `backend-api/.env`:

```bash
# Revenue Distribution Configuration
REVENUE_DISTRIBUTION_SECRET_TOKEN=Jr8LaU74I7tBxOOw2gMulyJVWtlVvWdj8faoh5V000A=
REVENUE_DISTRIBUTION_AMOUNT_USD=5.00
REVENUE_DISTRIBUTION_MIN_NFTS=30
REVENUE_DISTRIBUTION_CLAIM_FEE_USD=2.00
REVENUE_DISTRIBUTION_EXPIRY_DAYS=30
REVENUE_DISTRIBUTION_BATCH_SIZE=10
REVENUE_DISTRIBUTION_BATCH_DELAY_MS=6000
SECONDARY_SALE_CACHE_TTL_DAYS=30
BACKEND_API_URL=http://localhost:3001
```

**Save your token**: `Jr8LaU74I7tBxOOw2gMulyJVWtlVvWdj8faoh5V000A=`

---

## 📝 Step 2: Start Backend API

Open a terminal and run:

```bash
cd backend-api
npm install  # If you haven't already
npm start
```

**Expected output:**
```
✅ [API] Environment configuration validated successfully
🌍 [API] Environment: production (Production)
✅ [API] Firebase Admin initialized
🚀 [API] HTTP Server listening on 0.0.0.0:3001
```

**Leave this terminal running!** Open a new terminal for the next steps.

---

## 🧪 Step 3: Test Health Check

In a new terminal, run:

```bash
curl http://localhost:3001/health
```

**Expected response:**
```json
{
  "ok": true,
  "service": "backend-api",
  "timestamp": "2026-02-01T...",
  "environment": "production"
}
```

✅ If you see this, the API is working!

---

## 🔍 Step 4: Test Cache Stats (Before Allocation)

```bash
curl -H "Authorization: Bearer Jr8LaU74I7tBxOOw2gMulyJVWtlVvWdj8faoh5V000A=" \
  http://localhost:3001/api/revenue-distribution/cache-stats
```

**Expected response:**
```json
{
  "success": true,
  "cacheStats": {
    "totalCached": 0,
    "withSecondarySales": 0,
    "withoutSecondarySales": 0,
    "expired": 0,
    "valid": 0,
    "cacheHitRate": 0
  }
}
```

✅ Cache is empty (expected for first run)

---

## 🚀 Step 5: Run Dry-Run Allocation

**This is the big test!** This will:
- Load all users from Firestore
- Filter by NFT count (30+)
- Check Magic Eden secondary sales
- **NOT write to database** (safe!)

```bash
node backend-api/scripts/run-monthly-allocation.js --dry-run
```

**What to expect:**
1. **5-second countdown** - Script will start
2. **Step 1**: Loading users (5-10 seconds)
3. **Step 2**: Filtering by NFT count (instant)
4. **Step 3**: Checking secondary sales (10-15 minutes)
   - You'll see batch progress: "Batch 1/30", "Batch 2/30", etc.
   - Each batch takes 6 seconds
5. **Final summary** with stats

**Sample output:**
```
================================================================================
✅ ALLOCATION COMPLETED SUCCESSFULLY
================================================================================
Distribution ID: revenue_dist_2026_02
Total Users: 1000
NFT Eligible (30+): 300
Final Eligible (with secondary sales): 150
Total Allocated: $750.00 USD
Duration: 720.5s
Dry Run: Yes
================================================================================

💡 This was a DRY RUN - no data was written
   Run with --execute to write to database
```

**⏱️ Time estimate**: 
- If you have 1000 users → ~15 minutes
- If you have 500 users → ~8 minutes
- If you have 100 users → ~2 minutes

---

## 📊 Step 6: Verify Cache Stats (After Allocation)

After the dry-run completes, check cache again:

```bash
curl -H "Authorization: Bearer Jr8LaU74I7tBxOOw2gMulyJVWtlVvWdj8faoh5V000A=" \
  http://localhost:3001/api/revenue-distribution/cache-stats
```

**Expected response:**
```json
{
  "success": true,
  "cacheStats": {
    "totalCached": 300,
    "withSecondarySales": 150,
    "withoutSecondarySales": 150,
    "expired": 0,
    "valid": 300,
    "cacheHitRate": "100.0"
  }
}
```

✅ Cache is now populated! Next run will be much faster.

---

## ✅ Step 7: Review Results

**Questions to verify:**

1. **Does the user count make sense?**
   - Total users should match your userRewards collection size
   
2. **Does NFT eligible count make sense?**
   - How many users have 30+ NFTs?
   
3. **Does final eligible count make sense?**
   - Of the NFT-eligible users, how many bought from secondary?
   - This should be less than NFT eligible count

4. **Any errors in the output?**
   - Magic Eden rate limit errors? (Should auto-retry)
   - Firebase connection errors? (Check credentials)
   - Network timeouts? (Check internet connection)

---

## 🎯 Step 8: Test Secondary Sale Detection (Optional)

Want to test with a specific wallet? Edit this file:

```bash
# Edit: backend-api/scripts/test-secondary-sale-detection.js
# Add a wallet address to TEST_WALLETS array
```

Then run:
```bash
node backend-api/scripts/test-secondary-sale-detection.js
```

---

## ✨ Step 9: Ready for Production?

If dry-run succeeded:

**Tomorrow morning:**
```bash
node backend-api/scripts/run-monthly-allocation.js --execute
```

This will:
- ✅ Write allocations to Firestore
- ✅ Mark eligible users
- ✅ Enable claims via frontend

**Check allocation status:**
```bash
curl -H "Authorization: Bearer Jr8LaU74I7tBxOOw2gMulyJVWtlVvWdj8faoh5V000A=" \
  http://localhost:3001/api/revenue-distribution/allocation-status/revenue_dist_2026_02
```

---

## 🆘 Troubleshooting

### "Backend API not running"
```bash
cd backend-api
npm start
```

### "Unauthorized" error
- Check your secret token matches in both:
  - `backend-api/.env`
  - The curl command

### "Magic Eden rate limit exceeded"
- Increase `REVENUE_DISTRIBUTION_BATCH_DELAY_MS=10000` (10 seconds)
- Reduce `REVENUE_DISTRIBUTION_BATCH_SIZE=5`
- Wait 60 seconds and retry

### Dry-run taking too long
- This is normal for first run!
- 1000 users = ~15 minutes
- Subsequent runs will be 2-5 minutes (cache)

### No users eligible
- Check `REVENUE_DISTRIBUTION_MIN_NFTS=30` (maybe lower for testing?)
- Check Magic Eden API key is working
- Check users have `walletAddress` in userRewards

---

## 📞 Next Steps

After successful dry-run:

1. ✅ Review the stats
2. ✅ Verify cache is working
3. ✅ Tomorrow: Run production allocation
4. ✅ Monitor first claims
5. ✅ Set up automated monthly cron

---

## 🎉 Quick Command Reference

```bash
# Start backend
cd backend-api && npm start

# Test health
curl http://localhost:3001/health

# Cache stats
curl -H "Authorization: Bearer Jr8LaU74I7tBxOOw2gMulyJVWtlVvWdj8faoh5V000A=" \
  http://localhost:3001/api/revenue-distribution/cache-stats

# Dry-run allocation
node backend-api/scripts/run-monthly-allocation.js --dry-run

# Production allocation (tomorrow!)
node backend-api/scripts/run-monthly-allocation.js --execute

# Check allocation status
curl -H "Authorization: Bearer Jr8LaU74I7tBxOOw2gMulyJVWtlVvWdj8faoh5V000A=" \
  http://localhost:3001/api/revenue-distribution/allocation-status/revenue_dist_2026_02
```

---

## ⚡ Pro Tips

1. **First run is slow** - Cache makes it fast next time
2. **Run during off-peak hours** - Fewer rate limit issues
3. **Monitor the logs** - Watch for any warnings
4. **Keep secret token safe** - This controls admin access
5. **Test with dry-run first** - Always!

Good luck! 🚀
