import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
// PvP functionality removed

const activeSessions = new Map(); // sessionId -> { interval, channel, dashboardMessage, lastKillsA, lastKillsB }

export async function startKillRaceManager(session, channel) {
  const sessionId = session.session_id;
  
  // Don't start if already active
  if (activeSessions.has(sessionId)) {
    console.log(`Kill race session ${sessionId} already active`);
    return;
  }

  console.log(`Starting kill race manager for session ${sessionId}`);
  
  // Create dashboard embed and send initial message
  const dashboardMessage = await sendSessionDashboard(session, channel);
  
  // Update session with dashboard message ID
  await updateSessionDashboard(sessionId, dashboardMessage.id, channel.id);
  
  // Set up periodic updates every 30 seconds
  const updateInterval = setInterval(async () => {
    try {
      await updateSessionStatus(sessionId, channel, dashboardMessage);
    } catch (error) {
      console.error(`Error updating session ${sessionId}:`, error);
    }
  }, 30000);

  // Store session info
  activeSessions.set(sessionId, {
    interval: updateInterval,
    channel: channel,
    dashboardMessage: dashboardMessage,
    lastKillsA: session.kills_a || 0,
    lastKillsB: session.kills_b || 0
  });

  // Set timeout to complete session based on ends_at timestamp
  const endsAtMs = new Date(session.ends_at).getTime();
  const delayMs = Math.max(0, endsAtMs - Date.now());
  setTimeout(async () => {
    await completeKillRaceSession(sessionId);
  }, delayMs);
}

async function updateSessionStatus(sessionId, channel, dashboardMessage) {
  try {
    const session = await getSessionById(sessionId);
    
    if (!session || session.status !== 'active') {
      return;
    }

    // Check if session has ended
    if (new Date() >= new Date(session.ends_at)) {
      await completeKillRaceSession(sessionId);
      return;
    }

    // Check for kill changes and send notifications
    const sessionData = activeSessions.get(sessionId);
    if (sessionData) {
      await checkForKillUpdates(session, sessionData, channel);
    }

    // Update dashboard
    const updatedEmbed = createSessionEmbed(session);
    await dashboardMessage.edit({ embeds: [updatedEmbed] });
    
  } catch (error) {
    console.error(`Failed to update session ${sessionId}:`, error);
  }
}

async function completeKillRaceSession(sessionId) {
  try {
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) return;

    // Clear interval
    clearInterval(sessionData.interval);
    activeSessions.delete(sessionId);

    // Complete session and settle stakes
    const result = await completeSessionAndSettle(sessionId);
    
    if (result) {
      await announceResults(result, sessionData.channel, sessionData.dashboardMessage);
    }
    
  } catch (error) {
    console.error(`Error completing session ${sessionId}:`, error);
  }
}

async function announceResults(result, channel, dashboardMessage) {
  const { session, outcome, killsA, killsB, winnerId, loserId, settlement } = result;
  
  let resultEmbed;
  
  if (outcome === 'tie') {
    resultEmbed = new EmbedBuilder()
      .setTitle('🤝 Kill Race Tie!')
      .setDescription(`**Session #${session.session_id}** ended in a tie!`)
      .addFields(
        { name: '⚔️ Final Scores', value: `<@${session.player_a_discord_id}>: ${killsA} kills\n<@${session.player_b_discord_id}>: ${killsB} kills`, inline: false },
        { name: '💰 Stakes Returned', value: `${session.stake_mkin} MKIN returned to each player`, inline: true }
      )
      .setColor(0xFF6B35)
      .setFooter({ text: 'What a close match!' });
  } else {
    const winnerName = winnerId === session.player_a_discord_id ? 'Player A' : 'Player B';
    const winnerKills = winnerId === session.player_a_discord_id ? killsA : killsB;
    const loserKills = winnerId === session.player_a_discord_id ? killsB : killsA;
    
    resultEmbed = new EmbedBuilder()
      .setTitle(`🏁 **KILL RACE COMPLETE!** 🏁`)
      .setDescription(`**${winnerName}** emerges victorious!`)
      .addFields(
        { name: '🏆 Winner', value: `<@${winnerId}>: **${winnerKills}** kills`, inline: true },
        { name: '💀 Defeated', value: `<@${loserId}>: **${loserKills}** kills`, inline: true },
        { name: '💰 Prize', value: `${settlement.winnerPayout} MKIN`, inline: true },
        { name: '📊 Final Stats', value: `Kill difference: **${Math.abs(winnerKills - loserKills)}**\nRace duration: **${session.duration_minutes}** minutes`, inline: false }
      )
      .setColor(0x00D4AA)
      .setFooter({ text: 'GG! Great match!' });

  }

  await channel.send({ embeds: [resultEmbed] });
  await dashboardMessage.edit({ embeds: [resultEmbed] });
}

function createSessionEmbed(session) {
  const timeLeft = Math.max(0, Math.floor((new Date(session.ends_at) - Date.now()) / 1000 / 60));
  const timeLeftSeconds = Math.max(0, Math.floor((new Date(session.ends_at) - Date.now()) / 1000) % 60);
  
  const killsA = session.kills_a || 0;
  const killsB = session.kills_b || 0;
  const maxKills = Math.max(killsA, killsB, 10); // Minimum scale of 10
  
  // Create progress bars
  const progressA = createProgressBar(killsA, maxKills, 10);
  const progressB = createProgressBar(killsB, maxKills, 10);
  
  // Determine embed color based on who's leading
  let embedColor = 0xFF6B35; // Default orange
  if (killsA > killsB) {
    embedColor = 0x00D4AA; // Green for player A leading
  } else if (killsB > killsA) {
    embedColor = 0xFF4757; // Red for player B leading
  }
  
  // Add streak indicators
  const streakA = getStreakEmoji(killsA);
  const streakB = getStreakEmoji(killsB);
  
  // Create dynamic status message
  let statusMessage = '';
  if (killsA === killsB) {
    statusMessage = '🤝 **TIED RACE**';
  } else if (killsA > killsB) {
    const lead = killsA - killsB;
    statusMessage = `🔥 <@${session.player_a_discord_id}> leads by **${lead}**`;
  } else {
    const lead = killsB - killsA;
    statusMessage = `🔥 <@${session.player_b_discord_id}> leads by **${lead}**`;
  }
  
  // Add time pressure indicator
  if (timeLeft <= 2) {
    statusMessage += ` ⏰ **FINAL ${timeLeft} MIN!**`;
  } else if (timeLeft <= 5) {
    statusMessage += ` ⚡ ${timeLeft} minutes left`;
  }
  
  return new EmbedBuilder()
    .setTitle('🏁 **LIVE KILL RACE** 🏁')
    .setDescription(`**Session #${session.session_id}** • ${timeLeft}:${timeLeftSeconds.toString().padStart(2, '0')} remaining\n${statusMessage}`)
    .addFields(
      { 
        name: '⚔️ **LIVE SCORES**', 
        value: `${progressA} <@${session.player_a_discord_id}>: **${killsA}** ${streakA}\n${progressB} <@${session.player_b_discord_id}>: **${killsB}** ${streakB}`, 
        inline: false 
      },
      { name: '💰 Stakes', value: `${session.stake_mkin} MKIN each`, inline: true },
      { name: '🏆 Prize Pool', value: `${session.stake_mkin * 2} MKIN`, inline: true },
      { name: '📈 Momentum', value: getMomentumIndicator(session), inline: true }
    )
    .setColor(embedColor)
    .setFooter({ text: 'Use /train to rack up kills and dominate! 💀' });
}

// Create visual progress bar
function createProgressBar(current, max, length = 10) {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

// Get streak emoji based on kill count
function getStreakEmoji(kills) {
  if (kills >= 20) return '🔥🔥🔥';
  if (kills >= 15) return '🔥🔥';
  if (kills >= 10) return '🔥';
  if (kills >= 5) return '⚡';
  return '';
}

// Get momentum indicator
function getMomentumIndicator(session) {
  const killsA = session.kills_a || 0;
  const killsB = session.kills_b || 0;
  const lastKillA = session.last_kill_a ? new Date(session.last_kill_a) : null;
  const lastKillB = session.last_kill_b ? new Date(session.last_kill_b) : null;
  
  // Determine who killed more recently
  if (!lastKillA && !lastKillB) return '🎯 Even pace';
  if (!lastKillA) return '🚀 Player B hot';
  if (!lastKillB) return '🚀 Player A hot';
  
  const timeDiff = lastKillA.getTime() - lastKillB.getTime();
  if (Math.abs(timeDiff) < 30000) { // Within 30 seconds
    return '⚡ Neck & neck';
  } else if (timeDiff > 0) {
    return '🚀 Player A hot';
  } else {
    return '🚀 Player B hot';
  }
}

async function sendSessionDashboard(session, channel) {
  const embed = createSessionEmbed(session);
  return await channel.send({ 
    content: `🚀 **KILL RACE STARTED** 🚀\n<@${session.player_a_discord_id}> <@${session.player_b_discord_id}>`, 
    embeds: [embed] 
  });
}

// Check for kill updates and send real-time notifications
async function checkForKillUpdates(session, sessionData, channel) {
  const currentKillsA = session.kills_a || 0;
  const currentKillsB = session.kills_b || 0;
  const lastKillsA = sessionData.lastKillsA;
  const lastKillsB = sessionData.lastKillsB;

  // Check if Player A got new kills
  if (currentKillsA > lastKillsA) {
    const newKills = currentKillsA - lastKillsA;
    await sendKillNotification(session, 'player_a', newKills, currentKillsA, channel);
  }

  // Check if Player B got new kills
  if (currentKillsB > lastKillsB) {
    const newKills = currentKillsB - lastKillsB;
    await sendKillNotification(session, 'player_b', newKills, currentKillsB, channel);
  }

  // Update stored kill counts
  sessionData.lastKillsA = currentKillsA;
  sessionData.lastKillsB = currentKillsB;
}

// Send kill notification with streak tracking and momentum
async function sendKillNotification(session, player, newKills, totalKills, channel) {
  const playerId = player === 'player_a' ? session.player_a_discord_id : session.player_b_discord_id;
  const opponentId = player === 'player_a' ? session.player_b_discord_id : session.player_a_discord_id;
  const opponentKills = player === 'player_a' ? session.kills_b : session.kills_a;
  
  let notification = '';
  let emoji = '⚔️';
  
  // Single kill vs multi-kill
  if (newKills === 1) {
    notification = `${emoji} <@${playerId}> got a kill! (**${totalKills}** total)`;
  } else {
    notification = `🔥 <@${playerId}> got **${newKills} kills**! (**${totalKills}** total)`;
    emoji = '🔥';
  }
  
  // Add streak information
  if (totalKills >= 5 && totalKills % 5 === 0) {
    notification += ` 💀 **${totalKills}-kill streak!**`;
  }
  
  // Add lead/gap information
  const killDiff = totalKills - opponentKills;
  if (killDiff > 0) {
    if (killDiff === 1) {
      notification += ` 🎯 Taking the lead!`;
    } else if (killDiff >= 5) {
      notification += ` ⚡ Dominating with +${killDiff} kills!`;
    } else {
      notification += ` 📈 Leading by ${killDiff}!`;
    }
  } else if (killDiff === 0) {
    notification += ` 🤝 Tied up!`;
  } else if (killDiff === -1) {
    notification += ` 🔥 Closing the gap!`;
  }
  
  // Add time pressure
  const timeLeft = Math.max(0, Math.floor((new Date(session.ends_at) - Date.now()) / 1000 / 60));
  if (timeLeft <= 2) {
    notification += ` ⏰ **${timeLeft} minutes left!**`;
  }

  try {
    await channel.send(notification);
  } catch (error) {
    console.error('Failed to send kill notification:', error);
  }
}

export function stopKillRaceManager(sessionId) {
  const sessionData = activeSessions.get(sessionId);
  if (sessionData) {
    clearInterval(sessionData.interval);
    activeSessions.delete(sessionId);
    console.log(`Stopped kill race manager for session ${sessionId}`);
  }
}

// Export function to trigger immediate kill check (called from userWallets.js)
export async function notifyKillUpdate(sessionId) {
  const sessionData = activeSessions.get(sessionId);
  if (!sessionData) return;

  try {
    const session = await getSessionById(sessionId);
    if (session && session.status === 'active') {
      await checkForKillUpdates(session, sessionData, sessionData.channel);
      
      // Also update dashboard immediately
      const updatedEmbed = createSessionEmbed(session);
      await sessionData.dashboardMessage.edit({ embeds: [updatedEmbed] });
    }
  } catch (error) {
    console.error(`Failed to notify kill update for session ${sessionId}:`, error);
  }
}
