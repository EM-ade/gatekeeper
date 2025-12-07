# Supabase Row Level Security (RLS) Guide

## Overview

This guide explains how to secure your Supabase database while keeping the gatekeeper bot and frontend functioning normally.

---

## 🔑 **Key Concepts**

### **1. Service Role Key (Gatekeeper Bot)**
- **Bypasses all RLS policies**
- Full database access
- Used by: Gatekeeper bot backend
- Environment Variable: `SUPABASE_SERVICE_KEY`

### **2. Anon Key (Frontend)**
- **Subject to RLS policies**
- Limited by policy rules
- Used by: Frontend app, public API calls
- Environment Variable: `SUPABASE_ANON_KEY`

### **3. RLS Policies**
- Define who can read/write specific tables
- Only apply to `anon` and `authenticated` roles
- Service role bypasses all policies

---

## 📋 **Current Security Setup**

### **✅ Public Read (No authentication required):**

| Table | Access | Reason |
|-------|--------|--------|
| `bot_settings` | SELECT | Public bot configuration |
| `void_events` | SELECT | Public event info |
| `event_daily_progress` | SELECT | Public leaderboards |
| `linked_wallets` | SELECT | Leaderboards/stats |
| `battle_history` | SELECT | Public battle stats |
| `fused_characters` | SELECT | Public profiles |
| `realmkins` | SELECT | NFT directory |
| `pvp_*` tables | SELECT | Public PvP data |
| `event_participation` | SELECT | Leaderboards |
| `event_daily_user_kills` | SELECT | Kill tracking |

### **❌ No Public Access (Service role only):**

| Table | Reason |
|-------|--------|
| `withdrawal_transactions` | **HIGHLY SENSITIVE** - Financial data |
| `verification_sessions` | Contains auth tokens |
| `users` | Personal user data |
| `user_links` | Account linking data |
| `bot_configs` | Bot management |
| `guild_verification_contracts` | Admin configuration |
| `ledger_entries` | Financial transactions |
| `user_roles` | Permission data |
| `verification_attempts` | Security logs |

### **🚫 No Public Writes:**

**ALL tables** are read-only from the frontend. Only the gatekeeper bot (using service role) can write data.

---

## 🚀 **Deployment Steps**

### **Step 1: Backup Database**

```bash
# Export current schema and data
pg_dump $DATABASE_URL > backup_before_rls_$(date +%Y%m%d).sql
```

### **Step 2: Apply RLS Migration**

```bash
cd gatekeeper
psql $DATABASE_URL -f migrations/009_enable_rls_security.sql
```

### **Step 3: Verify RLS is Enabled**

```sql
-- Check which tables have RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- View all RLS policies
SELECT tablename, policyname, cmd, permissive
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
```

### **Step 4: Update Environment Variables**

#### **Gatekeeper Bot (.env):**
```bash
# MUST use service role key (not anon key)
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Service role
SUPABASE_URL=https://your-project.supabase.co
```

#### **Frontend (.env.local):**
```bash
# Use anon key (subject to RLS)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Anon key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

### **Step 5: Update Gatekeeper Code**

Make sure `gatekeeper/db.js` uses the **service role key**:

```javascript
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

const sql = postgres(connectionString, {
  // Service role bypasses RLS automatically
});

export default sql;
```

---

## 🧪 **Testing RLS Policies**

### **Test 1: Verify Service Role Bypasses RLS**

```sql
-- Run this with service role credentials
-- Should return all rows
SELECT COUNT(*) FROM withdrawal_transactions;
```

### **Test 2: Verify Anon Key is Blocked**

```javascript
// Use anon key in browser console or Postman
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
);

// Should return 0 rows (blocked by RLS)
const { data, error } = await supabase
  .from('withdrawal_transactions')
  .select('*');

console.log(data); // Expected: []
console.log(error); // Expected: null (policy just returns empty)
```

### **Test 3: Verify Public Read Works**

```javascript
// Should return data
const { data, error } = await supabase
  .from('linked_wallets')
  .select('*')
  .limit(10);

console.log(data); // Expected: Array of wallets
```

### **Test 4: Verify Public Writes are Blocked**

```javascript
// Should fail
const { data, error } = await supabase
  .from('linked_wallets')
  .insert({ user_id: 'test', wallet_address: 'test' });

console.log(error); // Expected: Policy violation error
```

---

## 🔒 **Security Best Practices**

### **✅ Do:**

1. **Always use service role key in backend** (gatekeeper)
2. **Use anon key in frontend** (public-facing apps)
3. **Monitor Supabase logs** for policy violations
4. **Test RLS policies** before deploying to production
5. **Keep service role key secret** (never expose in frontend)
6. **Use environment variables** for all keys
7. **Rotate keys periodically** (every 90 days)

### **❌ Don't:**

1. **Don't use service role key in frontend** - Full database access!
2. **Don't disable RLS on sensitive tables** (withdrawal_transactions, users, etc.)
3. **Don't trust client-side validation** - Always validate on backend
4. **Don't expose sensitive data** in public queries
5. **Don't commit keys to git** (.env in .gitignore)

---

## 🚨 **Troubleshooting**

### **Problem: Gatekeeper bot can't write to database**

**Cause:** Bot is using anon key instead of service role key

**Solution:**
```bash
# Check gatekeeper/.env
# Should have:
SUPABASE_SERVICE_KEY=eyJ...  # NOT SUPABASE_ANON_KEY
```

### **Problem: Frontend can't read public data**

**Cause:** RLS policy too restrictive

**Solution:**
Check if policy exists and allows SELECT:
```sql
SELECT * FROM pg_policies 
WHERE tablename = 'your_table_name';
```

### **Problem: "new row violates row-level security policy"**

**Cause:** Frontend trying to write data

**Solution:** 
Frontend should only read. All writes go through gatekeeper API.

### **Problem: Can't see withdrawal_transactions in Supabase dashboard**

**Cause:** Dashboard using anon key

**Solution:**
Switch to service role view in Supabase dashboard (Settings → API → Use service role key)

---

## 📊 **Monitoring**

### **Check for Policy Violations:**

```sql
-- View recent policy violations (if logging is enabled)
SELECT * FROM postgres_logs 
WHERE message LIKE '%policy%violation%'
ORDER BY timestamp DESC
LIMIT 100;
```

### **Monitor Database Access:**

In Supabase Dashboard:
1. Go to **Database** → **Logs**
2. Filter by `query` or `error`
3. Look for RLS-related errors

### **Audit Tables:**

```sql
-- Who's accessing what
SELECT 
  query, 
  user_name, 
  client_addr, 
  timestamp 
FROM postgres_logs 
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

---

## 🔄 **Rollback Plan**

If RLS causes issues:

```sql
-- Disable RLS on all tables (EMERGENCY ONLY)
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Restore from backup
psql $DATABASE_URL < backup_before_rls_YYYYMMDD.sql
```

---

## 📝 **Summary**

### **What RLS Protects:**

✅ **Withdrawal transactions** - Hidden from public  
✅ **User verification tokens** - Secure  
✅ **Financial data** - Service role only  
✅ **Admin configs** - Bot only  
✅ **Write operations** - All blocked from public  

### **What Still Works:**

✅ **Gatekeeper bot** - Full access (service role)  
✅ **Frontend reads** - Leaderboards, stats, profiles  
✅ **Public APIs** - Read-only access to public data  

### **Key Takeaway:**

> **Service role = Full access (gatekeeper)**  
> **Anon key = Read-only public data (frontend)**  
> **RLS policies enforce the boundary**

---

## 🆘 **Need Help?**

1. Check Supabase logs for errors
2. Test with SQL queries first
3. Verify environment variables
4. Review this guide
5. Contact team if issues persist

---

**Next Steps:**
1. ✅ Apply migration
2. ✅ Test with both keys
3. ✅ Monitor for issues
4. ✅ Document any custom policies
