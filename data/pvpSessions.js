import sql from '../db.js';

// Initialize PvP schema (challenges, sessions, logs)
export async function initPvpSchema() {
  // challenges
  await sql`
    create table if not exists pvp_challenges (
      challenge_id uuid primary key default gen_random_uuid(),
      challenger_id text not null,
      challenged_id text not null,
      stake_amount int not null,
      duration_minutes int not null,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default (now() + interval '5 minutes')
    )`;

  // sessions
  await sql`
    create table if not exists pvp_sessions (
      session_id uuid primary key default gen_random_uuid(),
      challenge_id uuid references pvp_challenges(challenge_id) on delete set null,
      player_a_id text not null,
      player_b_id text not null,
      stake_amount int not null,
      duration_minutes int not null,
      player_a_kills int not null default 0,
      player_b_kills int not null default 0,
      status text not null default 'active',
      winner_id text null,
      started_at timestamptz not null default now(),
      ends_at timestamptz not null default (now() + interval '10 minutes'),
      completed_at timestamptz null
    )`;

  // logs
  await sql`
    create table if not exists pvp_battle_logs (
      log_id uuid primary key default gen_random_uuid(),
      session_id uuid references pvp_sessions(session_id) on delete cascade,
      player_id text not null,
      kill_count int not null default 1,
      created_at timestamptz not null default now()
    )`;
}

// Challenges
export async function createChallenge(challengerId, challengedId, stake, duration) {
  const rows = await sql`
    insert into pvp_challenges (challenger_id, challenged_id, stake_amount, duration_minutes)
    values (${challengerId}, ${challengedId}, ${stake}, ${duration})
    returning *`;
  return rows[0];
}

export async function getChallengeById(challengeId) {
  const rows = await sql`select * from pvp_challenges where challenge_id = ${challengeId}`;
  return rows[0] || null;
}

export async function declineChallenge(challengeId) {
  await sql`update pvp_challenges set status = 'declined' where challenge_id = ${challengeId}`;
}

export async function expirePendingChallenges() {
  await sql`update pvp_challenges set status = 'expired' where status = 'pending' and expires_at < now()`;
}

// Accept -> create session
export async function acceptChallengeStartSession(challengeId) {
  const rows = await sql`update pvp_challenges set status = 'accepted' where challenge_id = ${challengeId} and status = 'pending' returning *`;
  const ch = rows[0];
  if (!ch) return null;
  const sess = await sql`
    insert into pvp_sessions (challenge_id, player_a_id, player_b_id, stake_amount, duration_minutes, ends_at)
    values (
      ${ch.challenge_id}, ${ch.challenger_id}, ${ch.challenged_id}, ${ch.stake_amount}, ${ch.duration_minutes},
      now() + (${ch.duration_minutes}::text || ' minutes')::interval
    )
    returning *`;
  return sess[0];
}

export async function getSessionById(sessionId) {
  const rows = await sql`select * from pvp_sessions where session_id = ${sessionId}`;
  return rows[0] || null;
}

export async function recordKill(sessionId, playerId, amount = 1) {
  const session = await getSessionById(sessionId);
  if (!session || session.status !== 'active') return null;
  const isA = session.player_a_id === playerId;
  const isB = session.player_b_id === playerId;
  if (!isA && !isB) return null;

  await sql`insert into pvp_battle_logs (session_id, player_id, kill_count) values (${sessionId}, ${playerId}, ${amount})`;
  if (isA) {
    await sql`update pvp_sessions set player_a_kills = player_a_kills + ${amount} where session_id = ${sessionId}`;
  } else {
    await sql`update pvp_sessions set player_b_kills = player_b_kills + ${amount} where session_id = ${sessionId}`;
  }
  const updated = await getSessionById(sessionId);
  return updated;
}

export async function completeSession(sessionId, winnerId = null) {
  const rows = await sql`
    update pvp_sessions
    set status = 'completed', winner_id = ${winnerId}, completed_at = now()
    where session_id = ${sessionId}
    returning *`;
  return rows[0] || null;
}
