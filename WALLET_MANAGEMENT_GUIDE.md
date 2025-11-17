# Wallet Management Guide

This guide explains how to manage and fix wallet addresses in the Realmkin system.

## Overview

The Realmkin system has several scripts to help manage wallet addresses:

1. **identify_invalid_wallets.js** - Identifies users with invalid wallet addresses
2. **migrate_wallet_addresses.js** - Migrates wallet addresses to correct case
3. **advanced_wallet_fix.js** - Fixes invalid wallet addresses using multiple strategies
4. **fix_invalid_wallets.js** - Focuses specifically on fixing invalid wallet addresses
5. **web3_context_wallet_fix.js** - Demonstrates how to use Web3 context to fix wallet addresses

## Prerequisites

All scripts use the Firebase configuration from the `.env` file. Make sure you have the following environment variables set:

- `FIREBASE_SERVICE_ACCOUNT_JSON` - Firebase service account credentials (JSON format)
- `FIREBASE_DATABASE_URL` - Firebase database URL
- `HELIUS_API_KEY` - Helius RPC API key for blockchain queries

## Usage

### 1. Identify Invalid Wallets

First, identify users with invalid wallet addresses:

```bash
npm run identify-invalid-wallets
```

This will:
- Scan all users in the database
- Identify those with invalid wallet addresses
- Create a JSON file with details of all users with invalid wallet addresses

### 2. Fix Invalid Wallets

After identifying invalid wallets, you can fix them using:

```bash
npm run fix-wallets
```

This script uses multiple strategies to fix invalid wallet addresses:
- Checks existing wallet mappings in the `wallets` collection
- Queries blockchain via Helius RPC to find the correct case-sensitive address
- Cross-references with session history
- Cross-references with verification sessions

### 3. Migrate Wallet Addresses

For general wallet address migration:

```bash
npm run migrate-wallets
```

This script:
- Finds all users with lowercase wallet addresses
- Attempts to recover original case from Firestore
- Verifies against blockchain
- Updates Firestore with correct case

### 4. Web3 Context Wallet Fix

To demonstrate how to use Web3 context to fix wallet addresses:

```bash
npm run fix-wallets-web3
```

This script shows how the frontend would interact with the Web3 context to get correct wallet addresses and update them in the backend.

## How It Works

### Wallet Address Validation

All scripts use Solana's `PublicKey` class to validate wallet addresses, which is more reliable than regex patterns.

### Fix Strategies

1. **Wallet Mapping Lookup**: Checks the `wallets` collection for existing correct mappings
2. **Blockchain Recovery**: Queries Helius RPC to find the correct case-sensitive address
3. **Session History**: Looks through user session data for correct wallet addresses
4. **Verification Sessions**: Checks verification session data for correct wallet addresses

## Environment Variables

The scripts require the following environment variables to be set in the `.env` file:

```
FIREBASE_SERVICE_ACCOUNT_JSON={"type": "service_account", ...}
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
HELIUS_API_KEY=your_helius_api_key
```

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

## Security Notes

- The Firebase service account JSON contains sensitive credentials
- Never commit this file to version control
- Ensure proper file permissions are set
- Rotate credentials regularly

## Troubleshooting

### Common Issues

1. **Firebase Authentication Errors**: Check that the service account JSON is valid and has proper permissions
2. **Helius API Errors**: Verify the API key is correct and has sufficient quota
3. **Permission Errors**: Ensure the service account has read/write access to Firestore collections

### Debugging

To run scripts with more verbose output, you can modify them to include additional logging or run with debug flags as needed.