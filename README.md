# Gatekeeper Discord Bot

Discord bot for Realmkin NFT verification, wallet management, and community features.

## Overview

The Gatekeeper bot handles:
- ✅ **Discord NFT Verification** - Verify Solana NFT ownership for role assignment
- 💰 **User Wallet Management** - Balance tracking, transfers, and withdrawals
- 🎮 **PvP Game System** - Discord-based PvP battles and events
- 🔗 **Discord-Wallet Linking** - Connect Discord accounts to Solana wallets

## Architecture

This repository contains **two separate services**:

### 1. Discord Bot (`/gatekeeper`)
- **Entry Point**: `bot.js`
- **Purpose**: Discord bot with wallet management APIs
- **Runs**: As a Discord bot + HTTP API server for wallet operations
- **Port**: 3000 (configurable)

### 2. Backend API (`/gatekeeper/backend-api`)
- **Entry Point**: `server.js`
- **Purpose**: Staking, boosters, revenue distribution, leaderboards
- **Runs**: As a standalone HTTP API server
- **Port**: 3001 (configurable)

**Note**: These services are deployed separately and communicate via HTTP APIs.

## Getting Started

### Run Discord Bot
```sh
npm run dev
# or
npm start
```

### Run Backend API
```sh
cd backend-api
npm run dev
# or
npm start
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Discord Bot
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id

# Solana
HELIUS_API_KEY=your_helius_key

# Database
DATABASE_URL=postgresql://...

# Firebase
FIREBASE_ADMIN_SDK={"type":"service_account",...}

# CORS (optional)
ALLOWED_ORIGIN=https://realmkin.com,https://app.realmkin.com
```

### CORS (Cross-Origin Resource Sharing)

The bot's wallet API supports multiple allowed origins. Configure using the `ALLOWED_ORIGIN` environment variable:

- **Single origin**: `ALLOWED_ORIGIN=https://example.com`
- **Multiple origins**: `ALLOWED_ORIGIN=https://example.com,https://app.example.com`
- **Allow all origins**: `ALLOWED_ORIGIN=*` (default, not recommended for production)

## Project Structure

```
gatekeeper/
├── bot.js                          # Discord bot entry point
├── commands/                       # Discord slash commands
│   ├── verify-nft.js              # NFT verification
│   ├── pvp.js                     # PvP game commands
│   └── ...
├── services/                       # Bot services
│   ├── nftVerification.js         # NFT ownership verification
│   ├── periodicVerification.js    # Auto-reverification
│   └── verificationSessionService.js
├── utils/                          # Shared utilities
│   ├── discordAlerts.js
│   ├── mkinPrice.js
│   └── solPrice.js
├── backend-api/                    # Separate backend service
│   ├── server.js                  # API entry point
│   ├── routes/                    # API endpoints
│   │   ├── staking.js
│   │   ├── boosters.js
│   │   ├── revenue-distribution.js
│   │   └── leaderboard.js
│   └── services/                  # API business logic
│       ├── stakingService.js
│       ├── boosterService.js
│       └── ...
└── scripts/                        # Discord bot testing scripts
    ├── test-discord-bot.js
    └── test-discord-alerts.js
```

## Features

### Discord Bot Features
- **NFT Verification**: Verify Solana NFT ownership and assign Discord roles
- **Wallet Management**: User balance tracking, transfers between users
- **Withdrawals**: Request and complete SOL withdrawals
- **Discord Linking**: Link Discord accounts to Solana wallets
- **PvP System**: Discord-based battle system
- **Admin Commands**: Balance adjustments, user management

### Backend API Features (in `/backend-api`)
- **Staking**: Stake MKIN tokens and earn rewards
- **Boosters**: NFT-based reward multipliers
- **Revenue Distribution**: Monthly revenue sharing for NFT holders
- **Leaderboards**: Track top stakers and secondary market buyers
- **Force Claims**: Automated reward distribution

## API Endpoints

### Discord Bot APIs (bot.js)
```
GET  /api/balance                    # Get user balance
POST /api/transfer                   # Transfer tokens between users
POST /api/withdraw/initiate          # Initiate withdrawal
POST /api/withdraw/complete          # Complete withdrawal
POST /api/link/discord               # Link Discord account
GET  /api/verification/session/:token # Verify NFT ownership
```

### Backend APIs (backend-api/server.js)
```
GET  /api/staking/overview           # Get staking overview
POST /api/staking/stake              # Stake tokens
POST /api/staking/unstake            # Unstake tokens
GET  /api/boosters/user              # Get user boosters
POST /api/boosters/refresh           # Refresh booster detection
GET  /api/revenue-distribution/check-eligibility  # Check eligibility
POST /api/revenue-distribution/claim # Claim revenue
GET  /api/leaderboard/mining/top10   # Get leaderboard
```

## Deployment

The bot and backend API are deployed separately:

### Discord Bot
```sh
# Deploy to Fly.io (or your platform)
fly deploy --config fly.bot.toml
```

### Backend API
```sh
cd backend-api
# Deploy to Render/Fly.io
fly deploy
```

## Documentation

- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Revenue Distribution](./REVENUE_DISTRIBUTION_GUIDE.md)
- [Backend API Documentation](./backend-api/README.md)

## Support

For issues or questions:
1. Check existing documentation
2. Review error logs
3. Contact the development team