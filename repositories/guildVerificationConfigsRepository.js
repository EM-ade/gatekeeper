import { getSupabaseClient } from '../utils/supabaseClient.js';

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    guildId: row.guild_id,
    contractAddress: row.contract_address,
    ruleType: row.rule_type || 'quantity',
    traitType: row.trait_type || null,
    traitValue: row.trait_value || null,
    requiredNftCount: row.required_nft_count,
    maxNftCount: row.max_nft_count ?? null,
    roleId: row.role_id,
    roleName: row.role_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getClient() {
  return getSupabaseClient();
}

export async function listByGuild(guildId) {
  const client = getClient();
  const response = await client
    .from('guild_verification_contracts')
    .select('*')
    .eq('guild_id', guildId)
    .order('required_nft_count', { ascending: true });

  if (response.error) {
    throw response.error;
  }

  return (response.data || []).map(mapRow);
}

export async function create({ guildId, contractAddress, ruleType = 'quantity', traitType = null, traitValue = null, requiredNftCount, maxNftCount = null, roleId, roleName }) {
  const client = getClient();
  const payload = {
    guild_id: guildId,
    contract_address: contractAddress,
    rule_type: ruleType,
    trait_type: traitType,
    trait_value: traitValue,
    required_nft_count: requiredNftCount,
    max_nft_count: maxNftCount,
    role_id: roleId,
    role_name: roleName,
  };

  const response = await client
    .from('guild_verification_contracts')
    .insert(payload)
    .select('*')
    .single();

  if (response.error) {
    throw response.error;
  }

  return mapRow(response.data);
}

export async function upsertRule({ guildId, contractAddress, requiredNftCount, maxNftCount = null, roleId, roleName }) {
  const client = getClient();
  const insertPayload = {
    guild_id: guildId,
    contract_address: contractAddress,
    rule_type: 'quantity',
    trait_type: null,
    trait_value: null,
    required_nft_count: requiredNftCount,
    max_nft_count: maxNftCount,
    role_id: roleId,
    role_name: roleName,
  };

  const insertResponse = await client
    .from('guild_verification_contracts')
    .insert(insertPayload)
    .select('*')
    .maybeSingle();

  if (!insertResponse.error) {
    return mapRow(insertResponse.data);
  }

  if (insertResponse.error.code !== '23505') {
    throw insertResponse.error;
  }

  const updateResponse = await client
    .from('guild_verification_contracts')
    .update({
      role_id: roleId,
      role_name: roleName,
      max_nft_count: maxNftCount,
      updated_at: new Date().toISOString(),
    })
    .eq('guild_id', guildId)
    .eq('contract_address', contractAddress)
    .eq('rule_type', 'quantity')
    .is('trait_type', null)
    .is('trait_value', null)
    .eq('required_nft_count', requiredNftCount)
    .eq('max_nft_count', maxNftCount)
    .select('*')
    .maybeSingle();

  if (updateResponse.error) {
    throw updateResponse.error;
  }

  return mapRow(updateResponse.data);
}

export async function deleteRule({ guildId, contractAddress, requiredNftCount = null, maxNftCount = null, traitType = null, traitValue = null }) {
  const client = getClient();
  let query = client
    .from('guild_verification_contracts')
    .delete()
    .eq('guild_id', guildId)
    .eq('contract_address', contractAddress);

  // For trait-based rules
  if (traitType !== null && traitType !== undefined) {
    query = query.eq('trait_type', traitType);
  }

  if (traitValue !== null && traitValue !== undefined) {
    query = query.eq('trait_value', traitValue);
  }

  // For quantity-based rules
  if (requiredNftCount !== null && requiredNftCount !== undefined) {
    query = query.eq('required_nft_count', requiredNftCount);
  }

  if (maxNftCount !== null && maxNftCount !== undefined) {
    query = query.eq('max_nft_count', maxNftCount);
  }

  const response = await query;

  if (response.error) {
    throw response.error;
  }

  return response.data;
}
