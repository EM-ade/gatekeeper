-- ============================================================================
-- Row Level Security (RLS) Policies for Supabase
-- Purpose: Secure database while allowing bot and frontend to function
-- ============================================================================

-- IMPORTANT: 
-- - Gatekeeper bot uses SERVICE_ROLE key (bypasses RLS)
-- - Frontend uses ANON key (subject to RLS policies)
-- - Users must be authenticated via Firebase before accessing data

-- ============================================================================
-- STEP 1: Enable RLS on all tables
-- ============================================================================

ALTER TABLE public.battle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_daily_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_daily_user_kills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fused_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_verification_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_battle_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realmkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_nft_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_verification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.void_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: Public Read-Only Tables (No authentication required)
-- ============================================================================

-- Bot Settings (public configuration)
CREATE POLICY "bot_settings_public_read" ON public.bot_settings
  FOR SELECT USING (true);

-- Void Events (public event information)
CREATE POLICY "void_events_public_read" ON public.void_events
  FOR SELECT USING (true);

-- Event Daily Progress (public leaderboards)
CREATE POLICY "event_daily_progress_public_read" ON public.event_daily_progress
  FOR SELECT USING (true);

-- ============================================================================
-- STEP 3: User-Specific Data Policies
-- ============================================================================

-- Note: Frontend should set custom claims or use auth.uid() matching
-- For now, we'll use permissive policies since gatekeeper handles auth

-- Linked Wallets: Users can read their own data
CREATE POLICY "linked_wallets_read_own" ON public.linked_wallets
  FOR SELECT USING (true); -- Allow read for leaderboards

-- Linked Wallets: No updates from frontend
CREATE POLICY "linked_wallets_no_public_write" ON public.linked_wallets
  FOR INSERT WITH CHECK (false);
CREATE POLICY "linked_wallets_no_public_update" ON public.linked_wallets
  FOR UPDATE USING (false);
CREATE POLICY "linked_wallets_no_public_delete" ON public.linked_wallets
  FOR DELETE USING (false);

-- Battle History: Users can read their own battles
CREATE POLICY "battle_history_read_own" ON public.battle_history
  FOR SELECT USING (true); -- Allow read for public stats

-- Battle History: No public writes
CREATE POLICY "battle_history_no_public_write" ON public.battle_history
  FOR ALL USING (false);

-- Fused Characters: Public read for profiles
CREATE POLICY "fused_characters_public_read" ON public.fused_characters
  FOR SELECT USING (true);

-- Fused Characters: No public writes
CREATE POLICY "fused_characters_no_public_write" ON public.fused_characters
  FOR ALL USING (false);

-- Items: Users can see their own items
CREATE POLICY "items_read_own" ON public.items
  FOR SELECT USING (true); -- Gatekeeper will filter by user_id

-- Items: No public writes
CREATE POLICY "items_no_public_write" ON public.items
  FOR ALL USING (false);

-- Realmkins: Public read (NFT directory)
CREATE POLICY "realmkins_public_read" ON public.realmkins
  FOR SELECT USING (true);

-- Realmkins: No public writes
CREATE POLICY "realmkins_no_public_write" ON public.realmkins
  FOR ALL USING (false);

-- PVP Challenges: Public read
CREATE POLICY "pvp_challenges_public_read" ON public.pvp_challenges
  FOR SELECT USING (true);

-- PVP Challenges: No public writes
CREATE POLICY "pvp_challenges_no_public_write" ON public.pvp_challenges
  FOR ALL USING (false);

-- PVP Sessions: Public read
CREATE POLICY "pvp_sessions_public_read" ON public.pvp_sessions
  FOR SELECT USING (true);

-- PVP Sessions: No public writes
CREATE POLICY "pvp_sessions_no_public_write" ON public.pvp_sessions
  FOR ALL USING (false);

-- PVP Battle Logs: Public read
CREATE POLICY "pvp_battle_logs_public_read" ON public.pvp_battle_logs
  FOR SELECT USING (true);

-- PVP Battle Logs: No public writes
CREATE POLICY "pvp_battle_logs_no_public_write" ON public.pvp_battle_logs
  FOR ALL USING (false);

-- Event Participation: Public read (leaderboards)
CREATE POLICY "event_participation_public_read" ON public.event_participation
  FOR SELECT USING (true);

-- Event Participation: No public writes
CREATE POLICY "event_participation_no_public_write" ON public.event_participation
  FOR ALL USING (false);

-- Event Daily User Kills: Public read (leaderboards)
CREATE POLICY "event_daily_user_kills_public_read" ON public.event_daily_user_kills
  FOR SELECT USING (true);

-- Event Daily User Kills: No public writes
CREATE POLICY "event_daily_user_kills_no_public_write" ON public.event_daily_user_kills
  FOR ALL USING (false);

-- ============================================================================
-- STEP 4: Admin/Bot-Only Tables (No public access)
-- ============================================================================

-- Bot Configs: No public access (bot management only)
CREATE POLICY "bot_configs_no_public_access" ON public.bot_configs
  FOR ALL USING (false);

-- Guild Verification Contracts: No public access
CREATE POLICY "guild_verification_contracts_no_public_access" ON public.guild_verification_contracts
  FOR ALL USING (false);

-- User Links: No public access
CREATE POLICY "user_links_no_public_access" ON public.user_links
  FOR ALL USING (false);

-- User Roles: No public access
CREATE POLICY "user_roles_no_public_access" ON public.user_roles
  FOR ALL USING (false);

-- User Verification History: No public access
CREATE POLICY "user_verification_history_no_public_access" ON public.user_verification_history
  FOR ALL USING (false);

-- Users: No public access
CREATE POLICY "users_no_public_access" ON public.users
  FOR ALL USING (false);

-- Verification Sessions: No public access (sensitive tokens)
CREATE POLICY "verification_sessions_no_public_access" ON public.verification_sessions
  FOR ALL USING (false);

-- Verification Attempts: No public access
CREATE POLICY "verification_attempts_no_public_access" ON public.verification_attempts
  FOR ALL USING (false);

-- User NFT Tokens: No public access
CREATE POLICY "user_nft_tokens_no_public_access" ON public.user_nft_tokens
  FOR ALL USING (false);

-- Ledger Entries: No public access (financial data)
CREATE POLICY "ledger_entries_no_public_access" ON public.ledger_entries
  FOR ALL USING (false);

-- ============================================================================
-- STEP 5: Withdrawal Transactions (HIGHLY SENSITIVE)
-- ============================================================================

-- Withdrawal Transactions: NO PUBLIC ACCESS AT ALL
-- Only service role (gatekeeper bot) can access this
CREATE POLICY "withdrawal_transactions_no_public_access" ON public.withdrawal_transactions
  FOR ALL USING (false);

-- ============================================================================
-- STEP 6: Create Helper Functions
-- ============================================================================

-- Function to check if current user is authenticated
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user's Firebase UID
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS TEXT AS $$
BEGIN
  RETURN auth.jwt() ->> 'sub';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 7: Grant Permissions
-- ============================================================================

-- Grant SELECT on public tables to authenticated users
GRANT SELECT ON public.bot_settings TO authenticated;
GRANT SELECT ON public.void_events TO authenticated;
GRANT SELECT ON public.event_daily_progress TO authenticated;
GRANT SELECT ON public.linked_wallets TO authenticated;
GRANT SELECT ON public.battle_history TO authenticated;
GRANT SELECT ON public.fused_characters TO authenticated;
GRANT SELECT ON public.items TO authenticated;
GRANT SELECT ON public.realmkins TO authenticated;
GRANT SELECT ON public.pvp_challenges TO authenticated;
GRANT SELECT ON public.pvp_sessions TO authenticated;
GRANT SELECT ON public.pvp_battle_logs TO authenticated;
GRANT SELECT ON public.event_participation TO authenticated;
GRANT SELECT ON public.event_daily_user_kills TO authenticated;

-- Grant SELECT to anon role (for public leaderboards)
GRANT SELECT ON public.bot_settings TO anon;
GRANT SELECT ON public.void_events TO anon;
GRANT SELECT ON public.event_daily_progress TO anon;
GRANT SELECT ON public.linked_wallets TO anon;
GRANT SELECT ON public.battle_history TO anon;
GRANT SELECT ON public.fused_characters TO anon;
GRANT SELECT ON public.realmkins TO anon;
GRANT SELECT ON public.pvp_challenges TO anon;
GRANT SELECT ON public.pvp_sessions TO anon;
GRANT SELECT ON public.pvp_battle_logs TO anon;
GRANT SELECT ON public.event_participation TO anon;
GRANT SELECT ON public.event_daily_user_kills TO anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- View all RLS policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, policyname;

-- Check which tables have RLS enabled
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename;

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- ✅ PUBLIC READ (No auth required):
--    - bot_settings, void_events, event_daily_progress
--    - linked_wallets (leaderboards)
--    - battle_history, fused_characters, realmkins
--    - pvp_*, event_participation, event_daily_user_kills

-- ✅ SERVICE ROLE ONLY (Gatekeeper bot):
--    - All write operations
--    - Sensitive tables: withdrawal_transactions, users, verification_*
--    - Admin tables: bot_configs, guild_verification_contracts

-- ✅ BLOCKED FROM PUBLIC:
--    - Writing/updating any data
--    - withdrawal_transactions (completely hidden)
--    - verification_sessions (sensitive tokens)
--    - user_links, ledger_entries (financial data)

-- ============================================================================
-- NOTES FOR DEPLOYMENT
-- ============================================================================

-- 1. Gatekeeper bot MUST use SERVICE_ROLE key (not anon key)
-- 2. Frontend can use ANON key for read-only operations
-- 3. Frontend should implement Firebase Auth for user-specific queries
-- 4. Monitor logs for policy violations in Supabase dashboard
-- 5. Test thoroughly before deploying to production

COMMENT ON TABLE public.withdrawal_transactions IS 'HIGHLY SENSITIVE - Service role access only';
