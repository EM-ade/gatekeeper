import sql from '../db.js';

// Map a Discord ID to unified user_id (UUID) via user_links
export async function getUnifiedUserIdByDiscord(discordId) {
  const rows = await sql`
    select user_id from user_links where discord_id = ${discordId}
  `;
  return rows[0]?.user_id || null;
}

// Add a ledger entry for a unified user_id; delta is bigint-compatible (integer)
export async function addLedgerByUserId(userId, delta, reason = '', refId = null) {
  const res = await sql`
    select public.apply_ledger_entry(${userId}::uuid, ${delta}::bigint, ${reason}, ${refId}) as balance
  `;
  return Number(res[0]?.balance || 0);
}

// Convenience: add a ledger entry by Discord ID (maps to unified user_id)
export async function addLedgerByDiscord(discordId, delta, reason = '', refId = null) {
  const unifiedId = await getUnifiedUserIdByDiscord(discordId);
  if (!unifiedId) throw new Error('No unified user_id for provided discordId');
  return addLedgerByUserId(unifiedId, delta, reason, refId);
}
