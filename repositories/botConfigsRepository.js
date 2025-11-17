import { getSupabaseClient } from '../utils/supabaseClient.js';

function getClient() {
  return getSupabaseClient();
}

export async function findByGuild(guildId) {
  const client = getClient();
  const response = await client
    .from('bot_configs')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

export async function upsertConfig({
  guildId,
  guildName,
  verificationChannelId = null,
  verificationMessageId = null,
  logChannelId = null,
}) {
  const client = getClient();
  
  // Build update object with only provided fields
  const updateData = {
    guild_id: guildId,
    guild_name: guildName,
  };

  if (verificationChannelId !== null) {
    updateData.verification_channel_id = verificationChannelId;
  }
  
  if (verificationMessageId !== null) {
    updateData.verification_message_id = verificationMessageId;
  }
  
  if (logChannelId !== null) {
    updateData.log_channel_id = logChannelId;
  }

  const response = await client
    .from('bot_configs')
    .upsert(updateData, { onConflict: 'guild_id' })
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}
