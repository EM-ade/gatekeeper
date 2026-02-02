# Revenue Distribution System - User Guide

## Overview

The Revenue Distribution System allows eligible users to claim $5 in SOL monthly based on their NFT holdings and secondary market activity.

**Eligibility Requirements:**
- ✅ Own 30+ Realmkin NFTs
- ✅ Have purchased from Magic Eden secondary market

**Distribution Method:**
- Users receive $5 USD worth of SOL (dynamic based on current SOL price)
- Claims require a $2 USD fee (to offset costs and prevent abuse)
- Net benefit: $3 USD per month

---

## System Architecture

### Components

1. **Secondary Sale Verification Service** (`backend-api/services/secondarySaleVerification.js`)
   - Checks Magic Eden transaction history
   - Caches results for 30 days
   - Rate-limited to respect Magic Eden API limits

2. **Revenue Distribution Route** (`backend-api/routes/revenue-distribution.js`)
   - Admin endpoints for allocation
   - User endpoints for claiming
   - Eligibility checking

3. **Monthly Allocation Script** (`backend-api/scripts/run-monthly-allocation.js`)
   - CLI tool to run monthly allocation
   - Can be triggered manually or via cron

### Collections

- **`revenueDistributionAllocations`** - Monthly eligibility records
- **`revenueDistributionClaims`** - Actual claim transactions
- **`secondarySaleCache`** - Magic Eden history cache

---

## For Administrators

### Running Monthly Allocation

The allocation process identifies eligible users for the current month.

#### Test Run (Dry Run)
```bash
# Safe - no database changes
node backend-api/scripts/run-monthly-allocation.js --dry-run
```

#### Production Run
```bash
# Real run - writes to database
node backend-api/scripts/run-monthly-allocation.js --execute
```

#### What It Does

1. **Load Users** - Fetches all users with wallet addresses
2. **Filter by NFTs** - Keeps only users with 30+ NFTs (instant)
3. **Check Secondary Sales** - Verifies Magic Eden purchases (SLOW - 10-15 min)
4. **Store Allocations** - Marks eligible users in Firestore

#### Performance

- **First Run**: 10-15 minutes for 1000 users
- **Subsequent Runs**: 2-5 minutes (80%+ cache hit rate)
- **Rate Limiting**: Safe for production (respects Magic Eden API limits)

### Monitoring Allocation

#### Check Allocation Status
```bash
curl -H "Authorization: Bearer $REVENUE_DISTRIBUTION_SECRET_TOKEN" \
  http://localhost:3001/api/revenue-distribution/allocation-status/revenue_dist_2026_02
```

Response:
```json
{
  "success": true,
  "distributionId": "revenue_dist_2026_02",
  "stats": {
    "total": 150,
    "pending": 120,
    "claimed": 25,
    "expired": 5,
    "totalAllocatedUsd": 750.00,
    "claimedUsd": 125.00,
    "unclaimedUsd": 625.00
  }
}
```

#### Check Cache Statistics
```bash
curl -H "Authorization: Bearer $REVENUE_DISTRIBUTION_SECRET_TOKEN" \
  http://localhost:3001/api/revenue-distribution/cache-stats
```

Response:
```json
{
  "success": true,
  "cacheStats": {
    "totalCached": 800,
    "withSecondarySales": 200,
    "withoutSecondarySales": 600,
    "expired": 50,
    "valid": 750,
    "cacheHitRate": "93.8"
  }
}
```

### Setting Up Automated Monthly Allocation

#### Using Cron (Linux/Mac)

Add to crontab:
```bash
# Run on the 1st of every month at 6 AM
0 6 1 * * cd /path/to/project && node backend-api/scripts/run-monthly-allocation.js --execute >> /var/log/revenue-allocation.log 2>&1
```

#### Using GitHub Actions

Create `.github/workflows/monthly-allocation.yml`:
```yaml
name: Monthly Revenue Allocation

on:
  schedule:
    - cron: '0 6 1 * *'  # 1st of month at 6 AM UTC
  workflow_dispatch:  # Manual trigger

jobs:
  allocate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: node backend-api/scripts/run-monthly-allocation.js --execute
        env:
          REVENUE_DISTRIBUTION_SECRET_TOKEN: ${{ secrets.REVENUE_DISTRIBUTION_SECRET_TOKEN }}
          BACKEND_API_URL: ${{ secrets.BACKEND_API_URL }}
```

---

## For Frontend Developers

### Integration Points

#### 1. Check User Eligibility

```javascript
// Call on page load or when user navigates to revenue section
const checkEligibility = async () => {
  const response = await fetch('/api/revenue-distribution/check-eligibility', {
    headers: {
      'Authorization': `Bearer ${firebaseToken}`
    }
  });
  
  const data = await response.json();
  
  if (data.eligible) {
    // Show "Claim $5" button
    console.log(`You can claim $${data.amountUsd}!`);
    console.log(`Fee: $${data.claimFeeUsd}`);
    console.log(`Expires: ${data.expiresAt}`);
  } else {
    // Show reason why not eligible
    console.log(`Not eligible: ${data.reason}`);
  }
};
```

#### 2. Claim Flow (Similar to Staking Claim)

```javascript
const claimRevenue = async () => {
  // Step 1: Pay $2 fee
  const feeTransaction = await sendSolTransaction({
    to: STAKING_WALLET_ADDRESS,
    amount: feeAmountSol, // Calculate from SOL price API
  });
  
  // Step 2: Submit claim
  const response = await fetch('/api/revenue-distribution/claim', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      feeSignature: feeTransaction.signature,
      distributionId: 'revenue_dist_2026_02' // From eligibility check
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log(`✅ Claimed ${result.amountSol} SOL ($${result.amountUsd})`);
    console.log(`Transaction: ${result.payoutSignature}`);
    // Show success message with Solscan link
  }
};
```

#### 3. Show Claim History

```javascript
const getClaimHistory = async () => {
  const response = await fetch('/api/revenue-distribution/history', {
    headers: {
      'Authorization': `Bearer ${firebaseToken}`
    }
  });
  
  const data = await response.json();
  
  // data.claims = [
  //   {
  //     distributionId: "revenue_dist_2026_02",
  //     amountSol: 0.041,
  //     amountUsd: 5.00,
  //     payoutTx: "signature...",
  //     claimedAt: "2026-02-15T10:30:00.000Z",
  //     status: "completed"
  //   }
  // ]
};
```

### UI Components Needed

1. **Eligibility Badge**
   ```
   🎉 You're eligible to claim $5!
   [Claim Now] button
   (Fee: $2 | Net: $3)
   Expires: Feb 28, 2026
   ```

2. **Not Eligible Message**
   ```
   ℹ️ You're not eligible this month
   Requirements:
   - ✅ Own 30+ NFTs
   - ❌ Purchase from secondary market
   ```

3. **Claim History Table**
   ```
   Month       Amount    Transaction    Status
   Feb 2026    $5.00     View on Solscan   ✅ Claimed
   Jan 2026    $5.00     View on Solscan   ✅ Claimed
   ```

---

## API Reference

### Admin Endpoints

All admin endpoints require `Authorization: Bearer <REVENUE_DISTRIBUTION_SECRET_TOKEN>`

#### POST `/api/revenue-distribution/allocate`

Run monthly allocation process.

**Query Parameters:**
- `dryRun` (boolean) - Test mode without database writes

**Response:**
```json
{
  "success": true,
  "stats": {
    "distributionId": "revenue_dist_2026_02",
    "totalUsers": 1000,
    "nftEligible": 300,
    "eligible": 150,
    "allocatedAmountUsd": 5.00,
    "totalAllocatedUsd": 750.00,
    "durationSeconds": 720.5
  },
  "dryRun": false
}
```

#### GET `/api/revenue-distribution/allocation-status/:distributionId`

Get allocation statistics for a distribution.

**Response:**
```json
{
  "success": true,
  "distributionId": "revenue_dist_2026_02",
  "stats": {
    "total": 150,
    "pending": 120,
    "claimed": 25,
    "expired": 5,
    "totalAllocatedUsd": 750.00,
    "claimedUsd": 125.00,
    "unclaimedUsd": 625.00
  }
}
```

#### GET `/api/revenue-distribution/cache-stats`

Get secondary sale cache statistics.

### User Endpoints

All user endpoints require Firebase authentication token.

#### GET `/api/revenue-distribution/check-eligibility`

Check if user can claim for current month.

**Response (Eligible):**
```json
{
  "success": true,
  "eligible": true,
  "distributionId": "revenue_dist_2026_02",
  "amountUsd": 5.00,
  "claimFeeUsd": 2.00,
  "expiresAt": "2026-02-28T23:59:59.000Z",
  "nftCount": 45
}
```

**Response (Not Eligible):**
```json
{
  "success": true,
  "eligible": false,
  "reason": "No allocation found for current month",
  "distributionId": "revenue_dist_2026_02"
}
```

#### POST `/api/revenue-distribution/claim`

Claim allocated funds.

**Request Body:**
```json
{
  "feeSignature": "transaction-signature",
  "distributionId": "revenue_dist_2026_02"
}
```

**Response:**
```json
{
  "success": true,
  "amountSol": 0.041,
  "amountUsd": 5.00,
  "payoutSignature": "transaction-signature",
  "feeSignature": "transaction-signature",
  "timestamp": "2026-02-15T10:30:00.000Z"
}
```

#### GET `/api/revenue-distribution/history`

Get user's claim history.

**Response:**
```json
{
  "success": true,
  "claims": [
    {
      "distributionId": "revenue_dist_2026_02",
      "amountSol": 0.041,
      "amountUsd": 5.00,
      "payoutTx": "signature",
      "claimedAt": "2026-02-15T10:30:00.000Z",
      "status": "completed"
    }
  ],
  "total": 1
}
```

---

## Environment Variables

```bash
# Required
REVENUE_DISTRIBUTION_SECRET_TOKEN=your-secret-token
STAKING_WALLET_ADDRESS=treasury-address
STAKING_PRIVATE_KEY=treasury-private-key
HELIUS_API_KEY=your-helius-key
MAGIC_EDEN_API_KEY=your-magic-eden-key

# Optional (with defaults)
REVENUE_DISTRIBUTION_AMOUNT_USD=5.00
REVENUE_DISTRIBUTION_MIN_NFTS=30
REVENUE_DISTRIBUTION_CLAIM_FEE_USD=2.00
REVENUE_DISTRIBUTION_EXPIRY_DAYS=30
REVENUE_DISTRIBUTION_BATCH_SIZE=10
REVENUE_DISTRIBUTION_BATCH_DELAY_MS=6000
SECONDARY_SALE_CACHE_TTL_DAYS=30
BACKEND_API_URL=http://localhost:3001
```

---

## Troubleshooting

### Allocation Taking Too Long

**Problem:** Allocation runs for 20+ minutes

**Solutions:**
1. Check Magic Eden API rate limits
2. Increase `REVENUE_DISTRIBUTION_BATCH_DELAY_MS` (reduces API calls/min)
3. Run during off-peak hours
4. Cache should improve speed on subsequent runs

### Magic Eden API Rate Limit Errors

**Problem:** `429 Too Many Requests` errors

**Solutions:**
1. Increase `REVENUE_DISTRIBUTION_BATCH_DELAY_MS` to 10000 (10 seconds)
2. Reduce `REVENUE_DISTRIBUTION_BATCH_SIZE` to 5
3. Wait 60 seconds and retry

### User Can't Claim

**Problem:** User says they're eligible but API says no

**Checks:**
1. Verify user has 30+ NFTs in `userRewards` collection
2. Check if allocation exists: `revenueDistributionAllocations` collection
3. Check if already claimed: Look for `status: 'claimed'`
4. Check if expired: Compare `expiresAt` with current time
5. Verify secondary sale cache has `hasSecondarySale: true`

### Failed Payouts

**Problem:** User paid fee but didn't receive SOL

**Recovery:**
1. Check `failed_payouts` collection
2. Verify treasury has sufficient SOL
3. Use recovery script (similar to staking claim recovery)
4. Manual payout if needed

---

## Rate Limiting Details

### Magic Eden API Limits
- **20 requests/second**
- **120 requests/minute**

### Our Implementation
- **Batch Size:** 10 users
- **Batch Delay:** 6 seconds
- **Max Rate:** 100 users/min (theoretical)
- **Actual Rate:** ~20-30 API calls/min (with 80% cache hit)

### Safety Margins
- Conservative batch sizing
- Automatic retry with backoff on 429 errors
- Cache to minimize API calls
- Rate limiter tracks sliding window

---

## Security Considerations

1. **Secret Token:** Admin endpoints require secret token
2. **Firebase Auth:** User endpoints require valid Firebase token
3. **Fee Verification:** On-chain verification of fee payment
4. **Treasury Balance:** Check before payout
5. **Duplicate Prevention:** Check for existing claims
6. **Failed Payout Logging:** Track and recover failed transactions

---

## Maintenance Tasks

### Monthly (After Each Distribution)

1. Check allocation completion
2. Monitor claim rate
3. Review failed payouts
4. Check treasury SOL balance

### Quarterly

1. Clear expired cache: Run cache cleanup
2. Review cache hit rates
3. Optimize batch sizing if needed
4. Update documentation

### As Needed

1. Adjust distribution amount
2. Modify NFT threshold
3. Update fee structure
4. Add new collection addresses

---

## Support

For issues or questions:

1. Check logs: `backend-api/logs/`
2. Review Firestore collections
3. Check Discord alerts
4. Contact development team

---

## Future Enhancements

Potential improvements:

- [ ] Tiered rewards (e.g., 50+ NFTs = $10)
- [ ] Bonus for long-term holders
- [ ] Multiple claim periods per month
- [ ] Automatic allocation via cron job
- [ ] Discord notifications for new allocations
- [ ] Frontend notification system
- [ ] Analytics dashboard
- [ ] CSV export for accounting
