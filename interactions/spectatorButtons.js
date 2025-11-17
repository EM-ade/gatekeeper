import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getSessionById } from '../data/pvp.js';

export async function handleSpectatorInteraction(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('spectate_')) {
    const sessionId = customId.split('_')[1];
    await handleSpectateSession(interaction, sessionId);
  } else if (customId.startsWith('cheer_')) {
    const cheerType = customId.split('_')[1];
    await handleCheerReaction(interaction, cheerType);
  }
}

async function handleSpectateSession(interaction, sessionId) {
  try {
    const session = await getSessionById(sessionId);
    
    if (!session || session.status !== 'active') {
      return interaction.reply({ 
        content: '❌ This race has ended or is no longer active.', 
        ephemeral: true 
      });
    }

    const timeLeft = Math.max(0, Math.floor((new Date(session.ends_at) - Date.now()) / 1000 / 60));
    const timeLeftSeconds = Math.max(0, Math.floor((new Date(session.ends_at) - Date.now()) / 1000) % 60);
    
    const killsA = session.kills_a || 0;
    const killsB = session.kills_b || 0;
    const maxKills = Math.max(killsA, killsB, 10);
    
    // Create progress bars
    const progressA = createProgressBar(killsA, maxKills, 10);
    const progressB = createProgressBar(killsB, maxKills, 10);
    
    // Determine who's leading
    let statusMessage = '';
    if (killsA === killsB) {
      statusMessage = '🤝 **TIED RACE** - Anyone\'s game!';
    } else if (killsA > killsB) {
      const lead = killsA - killsB;
      statusMessage = `🔥 <@${session.player_a_discord_id}> leads by **${lead}**!`;
    } else {
      const lead = killsB - killsA;
      statusMessage = `🔥 <@${session.player_b_discord_id}> leads by **${lead}**!`;
    }

    const spectateEmbed = new EmbedBuilder()
      .setTitle(`👀 **SPECTATING RACE #${session.session_id}** 👀`)
      .setDescription(`${statusMessage}\n⏱️ ${timeLeft}:${timeLeftSeconds.toString().padStart(2, '0')} remaining`)
      .addFields(
        { 
          name: '⚔️ **LIVE BATTLE**', 
          value: `${progressA} <@${session.player_a_discord_id}>: **${killsA}** kills\n${progressB} <@${session.player_b_discord_id}>: **${killsB}** kills`, 
          inline: false 
        },
        { name: '💰 Prize Pool', value: `${session.stake_mkin * 2} MKIN`, inline: true },
        { name: '📊 Intensity', value: getIntensityLevel(session.stake_mkin), inline: true },
        { name: '🎯 Prediction', value: getPrediction(killsA, killsB, timeLeft), inline: true }
      )
      .setColor(killsA === killsB ? 0xFF6B35 : (killsA > killsB ? 0x00D4AA : 0xFF4757))
      .setFooter({ text: 'Use the cheer buttons to support your favorite fighter!' });

    // Add cheer buttons
    const cheerButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`cheer_player_a_${sessionId}`)
          .setLabel(`🔥 Go ${session.player_a_discord_id.slice(-4)}!`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cheer_player_b_${sessionId}`)
          .setLabel(`⚡ Go ${session.player_b_discord_id.slice(-4)}!`)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cheer_hype_${sessionId}`)
          .setLabel('💀 EPIC!')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('refresh_spectate')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({ 
      embeds: [spectateEmbed], 
      components: [cheerButtons],
      ephemeral: true 
    });

  } catch (error) {
    console.error('Error handling spectate session:', error);
    await interaction.reply({ 
      content: '❌ Error loading race details. Please try again.', 
      ephemeral: true 
    });
  }
}

async function handleCheerReaction(interaction, cheerType) {
  const cheerMessages = {
    'fire': ['🔥 FIRE! The crowd goes wild!', '🔥 Absolutely blazing performance!', '🔥 ON FIRE!'],
    'hype': ['⚡ HYPE TRAIN! All aboard!', '⚡ The energy is electric!', '⚡ MAXIMUM HYPE!'],
    'epic': ['💀 EPIC BATTLE! This is legendary!', '💀 Absolutely incredible!', '💀 EPIC SHOWDOWN!'],
    'clutch': ['🎯 CLUTCH MOMENT! Pressure makes diamonds!', '🎯 Ice in their veins!', '🎯 CLUTCH PLAY!']
  };

  const messages = cheerMessages[cheerType] || ['🎉 Amazing!'];
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];

  // Send the cheer to the channel (not ephemeral)
  await interaction.reply({ content: randomMessage });
}

// Helper functions
function createProgressBar(current, max, length = 10) {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function getIntensityLevel(stake) {
  if (stake >= 500) return '🔥🔥🔥 LEGENDARY';
  if (stake >= 250) return '🔥🔥 HIGH STAKES';
  if (stake >= 100) return '🔥 INTENSE';
  return '⚡ CASUAL';
}

function getPrediction(killsA, killsB, timeLeft) {
  if (timeLeft <= 2) {
    if (killsA === killsB) return '🤝 Too close to call!';
    return killsA > killsB ? '🎯 Player A favored' : '🎯 Player B favored';
  }
  
  if (killsA === killsB) return '🤝 Even match';
  const lead = Math.abs(killsA - killsB);
  if (lead >= 5) return '⚡ Dominant lead';
  return '🔥 Close race';
}
