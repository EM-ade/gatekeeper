# Automatic Booster Refresh Setup

This guide explains how to set up automatic periodic booster refresh for all active users.

## Solution 2: Periodic Automatic Refresh

The `refresh-boosters.js` script should run automatically every 30 minutes to keep boosters up-to-date for all active staking users.

---

## Option 1: Linux/macOS Cron Job

### 1. Edit crontab:
```bash
crontab -e
```

### 2. Add this line to run every 30 minutes:
```bash
*/30 * * * * cd /path/to/gatekeeper && /usr/bin/node scripts/refresh-boosters.js >> logs/booster-refresh.log 2>&1
```

### 3. To run every hour instead:
```bash
0 * * * * cd /path/to/gatekeeper && /usr/bin/node scripts/refresh-boosters.js >> logs/booster-refresh.log 2>&1
```

### 4. Create log directory:
```bash
mkdir -p /path/to/gatekeeper/logs
```

---

## Option 2: Windows Task Scheduler

### 1. Open Task Scheduler
- Press `Win + R`, type `taskschd.msc`, press Enter

### 2. Create Basic Task
- Click "Create Basic Task"
- Name: "Realmkin Booster Refresh"
- Description: "Automatically refresh boosters for all active stakers"

### 3. Set Trigger
- Trigger: Daily
- Start time: 00:00
- Recur every: 1 day
- Advanced settings: Repeat task every 30 minutes for duration of 1 day

### 4. Set Action
- Action: Start a program
- Program/script: `node`
- Add arguments: `scripts/refresh-boosters.js`
- Start in: `C:\path\to\gatekeeper`

### 5. Enable logging
- In "Settings" tab, check "Allow task to be run on demand"
- Check "If the task fails, restart every: 1 minute"

---

## Option 3: PM2 (Recommended for Production)

PM2 can run the script on a schedule with automatic restart on failure.

### 1. Install PM2 globally:
```bash
npm install -g pm2
```

### 2. Create PM2 ecosystem file:
```bash
# In gatekeeper directory
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'booster-refresh',
      script: './scripts/refresh-boosters.js',
      cron_restart: '*/30 * * * *', // Every 30 minutes
      autorestart: false,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF
```

### 3. Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Set up auto-start on system boot
```

### 4. Monitor:
```bash
pm2 logs booster-refresh
pm2 status
```

---

## Option 4: Node.js Setinterval (Built-in)

For development or if you want it to run alongside the gatekeeper server.

### 1. Add to `gatekeeper/index.js`:
```javascript
import { refreshAllBoosters } from './scripts/refresh-boosters.js';

// Run booster refresh every 30 minutes
const BOOSTER_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

setInterval(async () => {
  console.log('🔄 Starting scheduled booster refresh...');
  try {
    await refreshAllBoosters();
  } catch (error) {
    console.error('❌ Scheduled booster refresh failed:', error);
  }
}, BOOSTER_REFRESH_INTERVAL);

// Run once on startup
setTimeout(() => {
  console.log('🚀 Running initial booster refresh on startup...');
  refreshAllBoosters().catch(error => {
    console.error('❌ Initial booster refresh failed:', error);
  });
}, 10000); // Wait 10 seconds after server starts
```

---

## Verification

### Check if the cron job is running:

**Linux/macOS:**
```bash
# View cron logs
tail -f logs/booster-refresh.log

# List active cron jobs
crontab -l
```

**Windows Task Scheduler:**
- Open Task Scheduler
- Look for "Realmkin Booster Refresh" in Task Scheduler Library
- Check "Last Run Result" - should be 0x0 (success)

**PM2:**
```bash
pm2 logs booster-refresh --lines 50
```

---

## Troubleshooting

### Script fails to run in cron:
- **Issue:** Environment variables not loaded
- **Solution:** Add full path to `.env` file or source it in the cron command:
  ```bash
  */30 * * * * cd /path/to/gatekeeper && source .env && /usr/bin/node scripts/refresh-boosters.js
  ```

### Permission denied:
```bash
chmod +x scripts/refresh-boosters.js
```

### Node not found:
```bash
# Use full path to node
which node  # Find the path
# Then use in cron: /usr/bin/node or /usr/local/bin/node
```

---

## Monitoring & Alerts

### Set up email alerts on failure (Linux):

Add to cron:
```bash
MAILTO=admin@realmkin.com
*/30 * * * * cd /path/to/gatekeeper && /usr/bin/node scripts/refresh-boosters.js || echo "Booster refresh failed at $(date)" | mail -s "Booster Refresh Failed" admin@realmkin.com
```

### Set up Discord webhook notification:

Add to `refresh-boosters.js`:
```javascript
// After successful refresh
await fetch(process.env.DISCORD_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: `✅ Booster refresh completed: ${usersRefreshed} users updated`
  })
});
```

---

## Recommended Schedule

- **Development:** Every 5 minutes (for testing)
- **Staging:** Every 30 minutes
- **Production:** Every 30-60 minutes

**Current recommendation:** Every 30 minutes provides a good balance between freshness and API rate limits.

---

## Summary

Choose the option that best fits your deployment:

1. **Cron** - Simple, native to Unix systems
2. **Task Scheduler** - Native to Windows
3. **PM2** - Best for production, includes monitoring and auto-restart
4. **SetInterval** - Easiest, runs alongside server

After setup, boosters will automatically refresh for all active stakers, preventing the issue where users have boosters but they're not detected.
