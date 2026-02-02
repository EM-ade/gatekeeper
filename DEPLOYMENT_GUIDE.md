# Gatekeeper Service Separation - Deployment Guide

## Overview

The Gatekeeper application has been split into two independent services:

1. **Discord Bot Service** (`gatekeeper-discord-bot`) - Handles Discord interactions, verification, commands
2. **Backend API Service** (`gatekeeper-api`) - Handles HTTP REST endpoints for frontend

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Shared Resources                        │
│  - Firestore (Firebase Admin)                               │
│  - PostgreSQL (Supabase)                                    │
│  - Solana RPC                                               │
│  - Environment Variables                                    │
└─────────────────────────────────────────────────────────────┘
           ↑                                    ↑
           │                                    │
┌──────────┴──────────┐              ┌─────────┴────────────┐
│   Discord Bot       │              │   Backend API        │
│   Service           │              │   Service            │
│                     │              │                      │
│ - Discord.js        │              │ - Express HTTP       │
│ - Commands          │              │ - /api/staking       │
│ - Events            │              │ - /api/boosters      │
│ - Verification      │              │ - /api/goal          │
│ - PVP/Training      │              │ - /api/leaderboard   │
│                     │              │ - Cron jobs          │
│ Port: None (WS)     │              │ Port: 3001           │
└─────────────────────┘              └──────────────────────┘
```

## Deployment Steps

### Step 1: Deploy Backend API Service

```bash
# Navigate to project root
cd /path/to/gatekeeper

# Create Fly.io app for Backend API
fly apps create gatekeeper-api

# Set environment variables for API service
fly secrets set -a gatekeeper-api \
  FIREBASE_SERVICE_ACCOUNT_JSON='<your-firebase-json>' \
  DATABASE_URL='<your-postgres-url>' \
  SUPABASE_URL='<your-supabase-url>' \
  SUPABASE_KEY='<your-supabase-key>' \
  HELIUS_MAINNET_RPC_URL='<your-helius-rpc>' \
  SOLANA_MAINNET_RPC_URL='<your-solana-rpc>' \
  STAKING_PRIVATE_KEY='<your-staking-key>' \
  ALLOWED_ORIGIN='https://yourfrontend.com' \
  NODE_ENV='production' \
  PORT='3001'

# Deploy Backend API
fly deploy -a gatekeeper-api -c backend-api/fly.toml --dockerfile backend-api/Dockerfile

# Verify deployment
fly logs -a gatekeeper-api
curl https://gatekeeper-api.fly.dev/health
```

### Step 2: Deploy Discord Bot Service

```bash
# Rename existing bot app (if needed)
fly apps rename gatekeeper-bot gatekeeper-discord-bot

# Set environment variables for Bot service
fly secrets set -a gatekeeper-discord-bot \
  DISCORD_TOKEN='<your-discord-token>' \
  DISCORD_CLIENT_ID='<your-discord-client-id>' \
  FIREBASE_SERVICE_ACCOUNT_JSON='<your-firebase-json>' \
  DATABASE_URL='<your-postgres-url>' \
  SUPABASE_URL='<your-supabase-url>' \
  SUPABASE_KEY='<your-supabase-key>' \
  HELIUS_API_KEY='<separate-helius-key-for-bot>' \
  HELIUS_MAINNET_RPC_URL='<your-helius-rpc>' \
  SOLANA_MAINNET_RPC_URL='<your-solana-rpc>' \
  STAKING_PRIVATE_KEY='<your-staking-key>' \
  NODE_ENV='production'

# Deploy Discord Bot
fly deploy -a gatekeeper-discord-bot -c fly.bot.toml --dockerfile Dockerfile.bot

# Verify deployment
fly logs -a gatekeeper-discord-bot
```

## Environment Variables

### Shared Environment Variables (Both Services)
```bash
FIREBASE_SERVICE_ACCOUNT_JSON='<firebase-admin-credentials>'
DATABASE_URL='<postgresql-connection-string>'
SUPABASE_URL='<supabase-project-url>'
SUPABASE_KEY='<supabase-service-role-key>'
HELIUS_MAINNET_RPC_URL='<helius-rpc-endpoint>'
SOLANA_MAINNET_RPC_URL='<solana-rpc-endpoint>'
STAKING_PRIVATE_KEY='<base58-encoded-keypair>'
NODE_ENV='production'
```

### Backend API Specific
```bash
PORT='3001'
SERVICE_TYPE='api'
ALLOWED_ORIGIN='https://yourfrontend.com,https://another-frontend.com'
```

### Discord Bot Specific
```bash
DISCORD_TOKEN='<your-bot-token>'
DISCORD_CLIENT_ID='<your-client-id>'
HELIUS_API_KEY='<separate-api-key-for-verification>'
SERVICE_TYPE='bot'
```

## Testing

### Test Backend API Locally
```bash
cd backend-api
npm install
npm run dev
# Visit http://localhost:3001/health
```

### Test Discord Bot Locally
```bash
# In project root
npm install
npm run dev
# Bot should connect to Discord
```

## Monitoring

### Backend API
```bash
# View logs
fly logs -a gatekeeper-api

# Check health
curl https://gatekeeper-api.fly.dev/health

# Monitor metrics
fly status -a gatekeeper-api
```

### Discord Bot
```bash
# View logs
fly logs -a gatekeeper-discord-bot

# Monitor metrics
fly status -a gatekeeper-discord-bot
```

## Scaling

### Scale Backend API (Handle more HTTP traffic)
```bash
fly scale count 2 -a gatekeeper-api
fly scale vm shared-cpu-2x -a gatekeeper-api
```

### Scale Discord Bot (More memory for verification)
```bash
fly scale vm shared-cpu-2x -a gatekeeper-discord-bot
```

## Rollback Plan

If issues arise, you can rollback to the monolithic deployment:

```bash
# Redeploy the original index.js
fly deploy -a gatekeeper-bot

# Scale down or destroy the new services
fly scale count 0 -a gatekeeper-api
fly apps destroy gatekeeper-api
```

## Benefits of Separation

✅ **Separate Logs** - Discord events don't mix with API requests  
✅ **Independent Scaling** - Scale API without affecting Discord bot  
✅ **Separate API Keys** - Different Helius keys for different rate limits  
✅ **Better Debugging** - Issues isolated to specific service  
✅ **Independent Deployment** - Deploy API changes without restarting bot  
✅ **Resource Optimization** - Allocate resources based on service needs  

## Troubleshooting

### API Service Issues
```bash
# Check if services can access database
fly ssh console -a gatekeeper-api
node -e "console.log(process.env.DATABASE_URL)"
```

### Bot Service Issues
```bash
# Check Discord connection
fly logs -a gatekeeper-discord-bot | grep "Discord bot is ready"

# Check verification logs
fly logs -a gatekeeper-discord-bot | grep "verification"
```

### Database Connection Issues
Both services must have identical database credentials. Verify:
```bash
fly secrets list -a gatekeeper-api
fly secrets list -a gatekeeper-discord-bot
```

## Support

For issues or questions:
1. Check logs: `fly logs -a <app-name>`
2. Verify environment variables are set correctly
3. Test health endpoints
4. Review this guide

## Migration Checklist

- [ ] Backend API deployed and healthy
- [ ] Discord Bot deployed and connected
- [ ] Frontend points to new API URL
- [ ] Both services can access database
- [ ] Verification working in Discord
- [ ] API endpoints responding correctly
- [ ] Scheduled tasks running (booster refresh, force-claim)
- [ ] Old monolithic service scaled down/destroyed
