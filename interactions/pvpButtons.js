import { getChallengeById, declineChallenge, acceptChallengeStartSession } from '../data/pvpSessions.js';
import { ensureStakeBalancesOrThrow, startSessionTimer, startPlayerRun } from '../game/pvpBattleManager.js';

export async function handlePvPButtonInteraction(interaction) {
  if (!interaction.isButton()) return;

  const id = interaction.customId || '';

  try {
    // Decline flow
    if (id.startsWith('pvp_decline_')) {
      const challengeId = id.replace('pvp_decline_', '');
      const challenge = await getChallengeById(challengeId);
      if (!challenge) return interaction.reply({ content: 'This challenge no longer exists.', ephemeral: true });
      if (challenge.challenged_id !== interaction.user.id) {
        return interaction.reply({ content: 'Only the challenged player can decline.', ephemeral: true });
      }
      await declineChallenge(challengeId);
      await interaction.update({ content: '❌ Challenge declined.', components: [] });
      return;
    }

    // Accept flow
    if (id.startsWith('pvp_accept_')) {
      const challengeId = id.replace('pvp_accept_', '');
      const challenge = await getChallengeById(challengeId);
      if (!challenge) return interaction.reply({ content: 'This challenge has expired or was removed.', ephemeral: true });
      if (challenge.challenged_id !== interaction.user.id) {
        return interaction.reply({ content: 'Only the challenged player can accept.', ephemeral: true });
      }

      // Ensure stakes and balances
      try {
        await ensureStakeBalancesOrThrow(challenge.challenger_id, challenge.challenged_id, challenge.stake_amount, challenge.challenge_id);
      } catch (e) {
        return interaction.reply({ content: `❌ Cannot start: ${e?.message || 'insufficient funds'}.`, ephemeral: true });
      }

      // Start session row and timer
      const session = await acceptChallengeStartSession(challengeId);
      if (!session) return interaction.reply({ content: '❌ Failed to start session. It may have been accepted already.', ephemeral: true });

      await interaction.update({ content: '✅ Challenge accepted! Battle starting...', components: [] });

      // Announce and start timer in channel
      await startSessionTimer(interaction.client, session, interaction.channel);

      // Offer Start buttons to each player for their runs
      await interaction.followUp({
        content: `Players may start their runs now:\n• <@${session.player_a_id}> — press Start\n• <@${session.player_b_id}> — press Start`,
        components: [
          new (await import('discord.js')).ActionRowBuilder().addComponents(
            new (await import('discord.js')).ButtonBuilder().setCustomId(`pvp_start_${session.session_id}_${session.player_a_id}`).setLabel('Start (Player A)').setStyle((await import('discord.js')).ButtonStyle.Primary),
            new (await import('discord.js')).ButtonBuilder().setCustomId(`pvp_start_${session.session_id}_${session.player_b_id}`).setLabel('Start (Player B)').setStyle((await import('discord.js')).ButtonStyle.Primary)
          )
        ]
      });
      return;
    }

    // Start player run
    if (id.startsWith('pvp_start_')) {
      const [, , sessionId, playerId] = id.split('_'); // pvp_start_{sessionId}_{playerId}
      if (interaction.user.id !== playerId) {
        return interaction.reply({ content: 'This Start button is not for you.', ephemeral: true });
      }
      await startPlayerRun(interaction, sessionId);
      return;
    }
  } catch (error) {
    console.error('PvP button handler error:', error);
    if (!interaction.replied && !interaction.deferred) {
      try { await interaction.reply({ content: '❌ Error handling button.', ephemeral: true }); } catch {}
    }
  }
}
