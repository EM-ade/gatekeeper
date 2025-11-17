# Wallet Address Fix Utilities

This directory contains scripts to help fix invalid wallet addresses in the Realmkin system.

## Scripts

### 1. `migrate_wallet_addresses.js`
The original migration script that:
- Finds all users with lowercase wallet addresses
- Attempts to recover original case from Firestore
- Verifies against blockchain
- Updates Firestore with correct case

### 2. `advanced_wallet_fix.js`
Enhanced script that fixes invalid wallet addresses using multiple strategies:
- Checks existing wallet mappings
- Queries blockchain for correct case
- Cross-references with session history
- Cross-references with verification sessions

### 3. `fix_invalid_wallets.js`
A focused script that specifically targets users with invalid wallet addresses and attempts to fix them.

## Usage

### Run the migration script:
```bash
npm run migrate-wallets
```

### Run the advanced wallet fix:
```bash
npm run fix-wallets
```

### Run directly with Node:
```bash
node migrate_wallet_addresses.js
node advanced_wallet_fix.js
node fix_invalid_wallets.js
```

## How It Works

### Wallet Address Validation
The scripts use Solana's `PublicKey` class to validate wallet addresses, which is more reliable than regex patterns.

### Fix Strategies
1. **Wallet Mapping Lookup**: Checks the `wallets` collection for existing correct mappings
2. **Blockchain Recovery**: Queries Helius RPC to find the correct case-sensitive address
3. **Session History**: Looks through user session data for correct wallet addresses
4. **Verification Sessions**: Checks verification session data for correct wallet addresses

## Environment Variables

Make sure you have the following environment variables set:
- `HELIUS_API_KEY` - Your Helius RPC API key
- `FIREBASE_SERVICE_ACCOUNT_PATH` - Path to your Firebase service account key file
- `FIREBASE_DATABASE_URL` - Your Firebase database URL

## Output

The scripts provide detailed output showing:
- Number of wallets processed
- Number of wallets fixed
- Number of wallets that failed to fix
- Details of fixed wallets
- List of wallets requiring manual intervention

## Manual Intervention

For wallets that cannot be automatically fixed, you should:
1. Contact the user and ask them to reconnect their wallet
2. Manually update the Firestore documents with the correct wallet address