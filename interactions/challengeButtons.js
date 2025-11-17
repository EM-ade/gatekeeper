import { EmbedBuilder } from 'discord.js';
import { getPendingChallenge, acceptChallenge, declineChallenge, createKillRaceSession } from '../data/pvp.js';
import { startKillRaceManager } from '../game/killRaceManager.js';

export async function handleChallengeButtonInteraction(interaction) {
  const [prefix, action, challengeId] = interaction.customId.split('_'); // challenge_action_id
  if (prefix !== 'challenge') return;

  if (action === 'accept') {
    await onAccept(interaction, challengeId);
  } else if (action === 'decline') {
    await onDecline(interaction, challengeId);
  }
}

async function onAccept(interaction, challengeId) {
  try {
    const challenge = await getPendingChallenge(challengeId);
    if (!challenge) {
      return interaction.reply({ content: '❌ Challenge not found or already resolved.', ephemeral: true });
    }
    // Only the opponent can accept
    if (challenge.opponent_discord_id !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the challenged player can accept this challenge.', ephemeral: true });
    }

    await acceptChallenge(challengeId);
    const session = await createKillRaceSession(challenge);

    const embed = new EmbedBuilder()
      .setTitle('✅ Challenge Accepted!')
      .setDescription(`Kill race session #${session.session_id} has begun!`)
      .addFields(
        { name: '⚔️ Competitors', value: `<@${challenge.challenger_discord_id}> vs <@${challenge.opponent_discord_id}>`, inline: false },
        { name: '💰 Stakes', value: `${challenge.stake_mkin} MKIN each`, inline: true },
        { name: '⏱️ Duration', value: `${challenge.duration_minutes} minutes`, inline: true }
      )
      .setColor(0x00D4AA)
      .setFooter({ text: 'Race is now live! Rack up kills with /train' });

    await interaction.update({ content: '🏁 KILL RACE ACTIVE', embeds: [embed], components: [] });

    // Start live manager
    await startKillRaceManager(session, interaction.channel);
  } catch (e) {
    console.error('Challenge accept failed:', e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Failed to accept challenge.', ephemeral: true });
    }
  }
}

async function onDecline(interaction, challengeId) {
  try {
    const challenge = await getPendingChallenge(challengeId);
    if (!challenge) {
      return interaction.reply({ content: '❌ Challenge not found or already resolved.', ephemeral: true });
    }
    if (challenge.opponent_discord_id !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the challenged player can decline this challenge.', ephemeral: true });
    }

    await declineChallenge(challengeId);

    const embed = new EmbedBuilder()
      .setTitle('❌ Challenge Declined')
      .setDescription(`<@${challenge.opponent_discord_id}> declined the challenge from <@${challenge.challenger_discord_id}>`)
      .setColor(0xFF4444);

    await interaction.update({ content: '💔 CHALLENGE DECLINED', embeds: [embed], components: [] });
  } catch (e) {
    console.error('Challenge decline failed:', e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Failed to decline challenge.', ephemeral: true });
    }
  }
}
