-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.battle_history (
  battle_id integer NOT NULL DEFAULT nextval('battle_history_battle_id_seq'::regclass),
  user_id text,
  battle_type text NOT NULL,
  result text NOT NULL,
  rewards jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT battle_history_pkey PRIMARY KEY (battle_id),
  CONSTRAINT battle_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.linked_wallets(user_id)
);
CREATE TABLE public.bot_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  guild_id text NOT NULL UNIQUE,
  guild_name text NOT NULL,
  log_channel_id text,
  verification_channel_id text,
  verification_message_id text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bot_configs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bot_settings (
  setting_name text NOT NULL,
  setting_value text,
  CONSTRAINT bot_settings_pkey PRIMARY KEY (setting_name)
);
CREATE TABLE public.event_daily_progress (
  event_id text NOT NULL,
  day_number integer NOT NULL,
  total_kills integer DEFAULT 0,
  unique_participants integer DEFAULT 0,
  recorded_at timestamp without time zone DEFAULT now(),
  CONSTRAINT event_daily_progress_pkey PRIMARY KEY (event_id, day_number),
  CONSTRAINT event_daily_progress_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.void_events(event_id)
);
CREATE TABLE public.event_daily_user_kills (
  event_id text NOT NULL,
  day_number integer NOT NULL,
  user_id text NOT NULL,
  kills integer DEFAULT 0,
  mkin_earned integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT event_daily_user_kills_pkey PRIMARY KEY (event_id, day_number, user_id),
  CONSTRAINT event_daily_user_kills_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.void_events(event_id),
  CONSTRAINT event_daily_user_kills_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.linked_wallets(user_id)
);
CREATE TABLE public.event_participation (
  event_id text NOT NULL,
  user_id text NOT NULL,
  kills integer DEFAULT 0,
  mkin_earned integer DEFAULT 0,
  CONSTRAINT event_participation_pkey PRIMARY KEY (event_id, user_id),
  CONSTRAINT event_participation_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.void_events(event_id),
  CONSTRAINT event_participation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.linked_wallets(user_id)
);
CREATE TABLE public.fused_characters (
  user_id text NOT NULL,
  username text NOT NULL UNIQUE,
  total_attack integer DEFAULT 0,
  total_defense integer DEFAULT 0,
  max_hp integer DEFAULT 100,
  current_hp integer DEFAULT 100,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  elemental_affinities jsonb DEFAULT '{}'::jsonb,
  archetype text DEFAULT 'ADVENTURER'::text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  speed integer DEFAULT 50,
  available_elements jsonb DEFAULT '[]'::jsonb,
  fusion_timestamp timestamp without time zone DEFAULT now(),
  tier integer NOT NULL DEFAULT 1,
  tier_level integer NOT NULL DEFAULT 1,
  tier_xp integer NOT NULL DEFAULT 0,
  CONSTRAINT fused_characters_pkey PRIMARY KEY (user_id),
  CONSTRAINT fused_characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.linked_wallets(user_id)
);
CREATE TABLE public.guild_verification_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  contract_address text NOT NULL,
  required_nft_count integer NOT NULL DEFAULT 1,
  role_id text,
  role_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  rule_type text NOT NULL DEFAULT 'quantity'::text CHECK (rule_type = ANY (ARRAY['quantity'::text, 'trait'::text])),
  trait_type text,
  trait_value text,
  max_nft_count integer,
  CONSTRAINT guild_verification_contracts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.items (
  item_id integer NOT NULL DEFAULT nextval('items_item_id_seq'::regclass),
  user_id text,
  nft_id text,
  item_type text NOT NULL,
  quantity integer DEFAULT 1,
  expires_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT items_pkey PRIMARY KEY (item_id),
  CONSTRAINT items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.linked_wallets(user_id),
  CONSTRAINT items_nft_id_fkey FOREIGN KEY (nft_id) REFERENCES public.realmkins(nft_id)
);
CREATE TABLE public.ledger_entries (
  id bigint NOT NULL DEFAULT nextval('ledger_entries_id_seq'::regclass),
  user_id uuid NOT NULL,
  delta bigint NOT NULL,
  reason text,
  ref_id text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_links(user_id)
);
CREATE TABLE public.linked_wallets (
  user_id text NOT NULL,
  wallet_address text,
  total_mkin_gained integer DEFAULT 0,
  total_kills integer DEFAULT 0,
  display_name text,
  CONSTRAINT linked_wallets_pkey PRIMARY KEY (user_id)
);
CREATE TABLE public.pvp_battle_logs (
  log_id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  player_id text NOT NULL,
  kill_count integer DEFAULT 1,
  timestamp timestamp without time zone DEFAULT now(),
  CONSTRAINT pvp_battle_logs_pkey PRIMARY KEY (log_id),
  CONSTRAINT pvp_battle_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.pvp_sessions(session_id)
);
CREATE TABLE public.pvp_challenges (
  challenge_id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenger_id text NOT NULL,
  challenged_id text NOT NULL,
  stake_amount integer NOT NULL,
  duration_minutes integer NOT NULL,
  status text DEFAULT 'pending'::text,
  created_at timestamp without time zone DEFAULT now(),
  expires_at timestamp without time zone DEFAULT (now() + '00:05:00'::interval),
  CONSTRAINT pvp_challenges_pkey PRIMARY KEY (challenge_id)
);
CREATE TABLE public.pvp_sessions (
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenge_id uuid,
  player_a_id text NOT NULL,
  player_b_id text NOT NULL,
  stake_amount integer NOT NULL,
  duration_minutes integer NOT NULL,
  player_a_kills integer DEFAULT 0,
  player_b_kills integer DEFAULT 0,
  status text DEFAULT 'active'::text,
  winner_id text,
  started_at timestamp without time zone DEFAULT now(),
  ends_at timestamp without time zone,
  completed_at timestamp without time zone,
  CONSTRAINT pvp_sessions_pkey PRIMARY KEY (session_id),
  CONSTRAINT pvp_sessions_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.pvp_challenges(challenge_id)
);
CREATE TABLE public.realmkins (
  nft_id text NOT NULL,
  user_id text,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  attack_boost integer DEFAULT 0,
  defense_boost integer DEFAULT 0,
  health_boost integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  tier integer NOT NULL DEFAULT 1,
  tier_level integer NOT NULL DEFAULT 1,
  tier_xp integer NOT NULL DEFAULT 0,
  CONSTRAINT realmkins_pkey PRIMARY KEY (nft_id),
  CONSTRAINT realmkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.linked_wallets(user_id)
);
CREATE TABLE public.user_balances (
  user_id uuid NOT NULL,
  balance bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_balances_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_links(user_id)
);
CREATE TABLE public.user_links (
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  firebase_uid text UNIQUE,
  discord_id text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_links_pkey PRIMARY KEY (user_id)
);
CREATE TABLE public.user_nft_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  mint text NOT NULL,
  name text,
  image text,
  verified_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_nft_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT user_nft_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  role_id text NOT NULL,
  role_name text,
  assigned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_verification_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  wallet_address text,
  nft_count integer DEFAULT 0,
  status text NOT NULL,
  verified_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_verification_history_pkey PRIMARY KEY (id),
  CONSTRAINT user_verification_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  discord_id text NOT NULL,
  guild_id text NOT NULL,
  username text,
  wallet_address text,
  is_verified boolean DEFAULT false,
  last_verification_check timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.verification_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  ip_hash text,
  user_agent text,
  result_code text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT verification_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT verification_attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.verification_sessions(id)
);
CREATE TABLE public.verification_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  discord_id text NOT NULL,
  guild_id text NOT NULL,
  username text,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  wallet_address text,
  signature text,
  signature_payload text,
  expires_at timestamp with time zone NOT NULL,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT verification_sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.void_events (
  event_id text NOT NULL,
  event_name text NOT NULL,
  start_time timestamp without time zone NOT NULL,
  end_time timestamp without time zone,
  total_days integer DEFAULT 5,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])),
  goal_kills integer DEFAULT 450,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT void_events_pkey PRIMARY KEY (event_id)
);
CREATE TABLE public.withdrawal_transactions (
  id integer NOT NULL DEFAULT nextval('withdrawal_transactions_id_seq'::regclass),
  user_id text NOT NULL,
  discord_id text,
  wallet_address text NOT NULL,
  amount_mkin numeric NOT NULL,
  fee_amount_sol numeric NOT NULL,
  fee_amount_usd numeric NOT NULL,
  sol_price_usd numeric NOT NULL,
  fee_tx_signature text,
  mkin_tx_signature text,
  status text NOT NULL,
  error_message text,
  error_code text,
  balance_before numeric,
  balance_after numeric,
  balance_deducted boolean DEFAULT false,
  balance_refunded boolean DEFAULT false,
  initiated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  fee_verified_at timestamp without time zone,
  completed_at timestamp without time zone,
  failed_at timestamp without time zone,
  refunded_at timestamp without time zone,
  ip_address text,
  user_agent text,
  retry_count integer DEFAULT 0,
  notes text,
  CONSTRAINT withdrawal_transactions_pkey PRIMARY KEY (id)
);