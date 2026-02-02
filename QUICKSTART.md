# Quick Start Guide - Local Development

## Prerequisites
- Node.js 20.11.1 or higher
- npm
- PostgreSQL database (Supabase)
- Firebase service account
- Discord bot token

## Setup

### 1. Install Dependencies

**Backend API:**
```bash
cd backend-api
# No need to install - uses root node_modules via NODE_PATH
```

**Discord Bot:**
```bash
# In project root
npm install
```

### 2. Configure Environment Variables

**Backend API** is already configured with `backend-api/.env`
- All environment variables copied from root `.env`
- PORT set to 3001
- SERVICE_TYPE set to "api"

**Discord Bot** uses the root `.env` file
- Make sure DISCORD_TOKEN is set
- Make sure all required variables are present

### 3. Start Services

**Terminal 1 - Start Backend API:**
```bash
cd backend-api

# Windows:
set NODE_PATH=../node_modules
npm start

# Mac/Linux:
NODE_PATH=../node_modules npm start
```
API will be available at: http://localhost:3001

**Terminal 2 - Start Discord Bot:**
```bash
# In project root
npm start
```
Bot will connect to Discord Gateway

### 4. Test Everything

**Test Backend API:**
```bash
node scripts/test-backend-api.js
```

**Test Discord Bot:**
```bash
node scripts/test-discord-bot.js
```

**Test Frontend Connection:**
```bash
node scripts/test-frontend-connection.js
```

## Verify It's Working

### Backend API Health Check
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "ok": true,
  "service": "backend-api",
  "timestamp": "2026-01-28T..."
}
```

### Test API Endpoints
```bash
# Leaderboard (public)
curl http://localhost:3001/api/leaderboard

# Goal (public)
curl http://localhost:3001/api/goal

# Staking (requires auth)
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/staking/balance
```

### Discord Bot
Check your Discord server - the bot should be online and responding to commands.

## Common Issues

### Backend API won't start
- Check `backend-api/.env` exists
- Verify DATABASE_URL is set
- Ensure Firebase credentials are valid
- Check port 3001 is not in use

### Discord Bot won't start
- Verify DISCORD_TOKEN in root `.env`
- Check Firebase credentials
- Ensure database is accessible

### CORS Errors
- Update `ALLOWED_ORIGIN` in `backend-api/.env`
- Include your frontend URL
- For local dev: `http://localhost:3000`

## Frontend Integration

Update your frontend to point to:
```javascript
const API_BASE_URL = 'http://localhost:3001';
```

In production:
```javascript
const API_BASE_URL = 'https://gatekeeper-api.fly.dev';
```

## Next Steps

1. ✅ Both services running locally
2. ✅ All tests passing
3. 📝 Update frontend API URL
4. 🧪 Test frontend integration
5. 🚀 Deploy to production (see DEPLOYMENT_GUIDE.md)

## Need Help?

- Check logs: Both services output detailed logs
- Run test scripts to diagnose issues
- Review DEPLOYMENT_GUIDE.md for more details
- Check environment variables are set correctly
