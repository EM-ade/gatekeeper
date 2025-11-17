import { EmbedBuilder } from 'discord.js';
import { getLeaderboard, calculateTotalKills } from '../data/userWallets.js';
import { runCombatCycle } from './voidBattleSystem.js';
import { 
  getCurrentEvent, 
  calculateEventKills, 
  getEventLeaderboard,
  getDailyLeaderboard,
  getCurrentDayNumber,
  recordDailyProgress,
  endEvent as endVoidEvent,
  createNewEvent
} from '../data/eventManager.js';
import gameState from '../gameState.js';

// Event state management
const eventState = {
    currentDay: 1,
    dashboardMessageId: null,
    eventStartTime: null,
    todayKills: 0,
    totalKills: 0,
    updateInterval: null,
    consecutiveErrors: 0,
    lastEvent: 'Event starting...'
};

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
    baseInterval: 15000, // 15 seconds
    maxBackoff: 60000,   // 1 minute max backoff
    maxConsecutiveErrors: 5
};

/**
 * Format time remaining in HH:MM:SS format
 */
function formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return '00:00:00';
    
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format leaderboard for display
 */
function formatLeaderboard(leaderboardData, totalCombatants = 0) {
    if (!leaderboardData || leaderboardData.length === 0) {
        return 'No participants yet!';
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    
    let leaderboardText = '';
    const topPlayers = leaderboardData.slice(0, 10);
    
    topPlayers.forEach((player, index) => {
        const medal = index < medals.length ? medals[index] : '▪️';
        // Handle different field names for kills (kills, event_kills, or total_kills)
        const kills = player.kills !== undefined ? player.kills :
                     (player.event_kills !== undefined ? player.event_kills :
                     (player.total_kills || 0));
        const displayName = player.display_name || player.name || 'Unknown';
        leaderboardText += `${medal} ${displayName} - ${kills} Kills\n`;
    });

    if (totalCombatants > 10) {
        leaderboardText += `\n📊 Total Combatants: ${totalCombatants}`;
    }

    return leaderboardText;
}

/**
 * Create live dashboard embed
 */
export function createLiveDashboardEmbed(day, timeRemaining, todayKills, totalKills, leaderboard, lastEvent) {
    return new EmbedBuilder()
        .setTitle(`--- VOID ARENA: DAY ${day} of 5 ---`)
        .setColor(0x0099ff)
        .addFields(
            {
                name: '⏰ Time Remaining',
                value: `\`${timeRemaining}\``,
                inline: true
            },
            {
                name: '🗡️ Total Kills Today',
                value: `\`${todayKills}\``,
                inline: true
            },
            {
                name: '🏆 Total Event Kills',
                value: `\`${totalKills}\``,
                inline: true
            },
            {
                name: '🏆 LEADERBOARD (LIVE) 🏆',
                value: formatLeaderboard(leaderboard.players, leaderboard.totalCombatants),
                inline: false
            }
        )
        .setTimestamp();
}

/**
 * Handle rate limit errors with exponential backoff
 */
async function handleRateLimit(error, currentInterval) {
    eventState.consecutiveErrors++;
    
    const retryAfter = error.retryAfter ? error.retryAfter * 1000 : 5000;
    const backoffTime = Math.min(
        retryAfter * Math.pow(2, eventState.consecutiveErrors), 
        RATE_LIMIT_CONFIG.maxBackoff
    );
    
    console.log(`Rate limited. Backing off for ${backoffTime}ms`);
    await sleep(backoffTime);
    
    if (eventState.consecutiveErrors > RATE_LIMIT_CONFIG.maxConsecutiveErrors) {
        // Switch to slower update mode
        const newInterval = Math.min(currentInterval * 2, 60000); // Max 1 minute
        console.log(`Switching to slower update mode: ${newInterval}ms`);
        return newInterval;
    }
    
    return currentInterval;
}

/**
 * Sleep utility function
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get latest kill event from combat cycle
 */
function getLatestKillEvent() {
    // This would interface with the combat system to get the most recent kill
    // For now, using a placeholder - would be replaced with actual event tracking
    const events = [
        'ShadowSlayer has slain a Beastkin Hunter!',
        'DragonHeart defeated a Void Stalker!',
        'NightBlade vanquished an Ancient Guardian!',
        'StormCaller crushed a Shadow Predator!',
        'PhoenixRider obliterated a Beastkin Champion!'
    ];
    return events[Math.floor(Math.random() * events.length)];
}

/**
 * Start live dashboard event for a specific day
 */
export async function startLiveDashboardEvent(day, channel) {
    // Initialize event state
    eventState.currentDay = day;
    eventState.eventStartTime = Date.now();
    eventState.todayKills = 0;
    
    // Get current event and use event-specific kills
    const currentEvent = await getCurrentEvent();
    const initialTotal = currentEvent ? await calculateEventKills(currentEvent.event_id) : 0;
    eventState.totalKills = Number(initialTotal) || 0;
    eventState.consecutiveErrors = 0;
    eventState.lastEvent = 'Event starting...';

    // Reconcile: ensure all in-memory joined players are registered in the current event
    try {
        if (currentEvent && gameState && gameState.players) {
            const { addPlayerToEvent } = await import('../data/eventManager.js');
            const playerIds = Object.keys(gameState.players);
            for (const userId of playerIds) {
                try {
                    await addPlayerToEvent(userId);
                } catch (e) {
                    console.warn(`Failed to reconcile participant ${userId} into event ${currentEvent.event_id}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.warn('Participant reconciliation encountered an error:', e.message);
    }

    // Post initial dashboard with daily leaderboard for current day
    let leaderboard;
    if (currentEvent) {
        // Use daily leaderboard to show today's progress
        const dayNumber = day || getCurrentDayNumber(currentEvent);
        leaderboard = await getDailyLeaderboard(currentEvent.event_id, dayNumber);
    } else {
        leaderboard = await getLeaderboard();
    }
    const initialEmbed = createLiveDashboardEmbed(
        day, 
        '24:00:00', 
        0, 
        eventState.totalKills, 
        { players: leaderboard, totalCombatants: leaderboard.length },
        eventState.lastEvent
    );
    
    const dashboardMessage = await channel.send({ embeds: [initialEmbed] });
    eventState.dashboardMessageId = dashboardMessage.id;

    console.log(`🚀 Starting Live Dashboard for Day ${day}`);

    // Start update loop
    let updateInterval = RATE_LIMIT_CONFIG.baseInterval;
    
    eventState.updateInterval = setInterval(async () => {
        try {
            // Calculate time remaining
            const elapsed = Date.now() - eventState.eventStartTime;
            const remaining = 86400000 - elapsed; // 24 hours in ms
            const timeRemaining = formatTimeRemaining(remaining);

            // Check if day is over
            if (remaining <= 0) {
                clearInterval(eventState.updateInterval);
                await endDay(day, channel);
                return;
            }

            // Run combat simulation cycle
            const newKills = await runCombatCycle();
            eventState.todayKills += newKills;
            eventState.totalKills += newKills;

            // Update leaderboard with daily data for live dashboard
            const currentEvent = await getCurrentEvent();
            let leaderboardData;
            if (currentEvent) {
                // Use daily leaderboard for live dashboard to show today's progress
                const dayNumber = day || getCurrentDayNumber(currentEvent);
                leaderboardData = await getDailyLeaderboard(currentEvent.event_id, dayNumber);
            } else {
                leaderboardData = await getLeaderboard();
            }
            
            // Get latest event
            eventState.lastEvent = getLatestKillEvent();

            // Update dashboard
            const updatedEmbed = createLiveDashboardEmbed(
                day, 
                timeRemaining, 
                eventState.todayKills, 
                eventState.totalKills, 
                { players: leaderboardData, totalCombatants: leaderboardData.length },
                eventState.lastEvent
            );

            await dashboardMessage.edit({ embeds: [updatedEmbed] });
            
            // Reset error counter on successful update
            eventState.consecutiveErrors = 0;

        } catch (error) {
            console.error('Dashboard update error:', error);
            
            if (error.code === 429) { // Rate limited
                updateInterval = await handleRateLimit(error, updateInterval);
                
                // Restart interval with new timing
                clearInterval(eventState.updateInterval);
                eventState.updateInterval = setInterval(arguments.callee, updateInterval);
            }
        }
    }, updateInterval);
}

/**
 * End current day and generate summary
 */
export async function endDay(day, channel) {
    console.log(`🏁 Ending Day ${day}`);
    
    try {
        const currentEvent = await getCurrentEvent();
        
        // Get final leaderboard for the day (event-specific if available)
        const finalLeaderboard = currentEvent ? await getEventLeaderboard(currentEvent.event_id) : await getLeaderboard();
        
        // Create final dashboard embed
        const finalEmbed = createLiveDashboardEmbed(
            day, 
            '00:00:00', 
            eventState.todayKills, 
            eventState.totalKills, 
            { players: finalLeaderboard, totalCombatants: finalLeaderboard.length },
            'Day concluded!'
        );

        // Post final message
        await channel.send({ 
            content: `🏁 **DAY ${day} COMPLETE** 🏁\nTotal Kills Today: ${eventState.todayKills}`,
            embeds: [finalEmbed]
        });

        // Record daily progress if we have an active event
        if (currentEvent) {
            const uniqueParticipants = finalLeaderboard.length;
            await recordDailyProgress(currentEvent.event_id, day, eventState.todayKills, uniqueParticipants);
            console.log(`📊 Recorded daily progress for Day ${day}: ${eventState.todayKills} kills, ${uniqueParticipants} participants`);
        } else {
            console.log(`📊 Day ${day} Summary: ${eventState.todayKills} kills`);
        }

        // Prepare for next day or end event
        if (day === 5) {
            await generateGrandFinalSummary(channel);
        } else {
            // Schedule next day start (24 hours from now)
            setTimeout(() => {
                startLiveDashboardEvent(day + 1, channel);
            }, 86400000); // 24 hours
        }

    } catch (error) {
        console.error('Error ending day:', error);
    }
}

/**
 * Generate grand final summary with event-specific data
 */
async function generateGrandFinalSummary(channel) {
    console.log('🎉 Generating Grand Final Summary');
    
    const currentEvent = await getCurrentEvent();
    
    // Use event-specific leaderboard if available
    const finalLeaderboard = currentEvent ? await getEventLeaderboard(currentEvent.event_id) : await getLeaderboard();
    const top10 = finalLeaderboard.slice(0, 10);
    
    let summaryText = '🏆 **GRAND FINAL LEADERBOARD** 🏆\n\n';
    
    top10.forEach((player, index) => {
        const rank = index + 1;
        const kills = currentEvent ? player.kills : player.total_kills;
        summaryText += `${rank}. ${player.display_name || 'Unknown'} - ${kills} Kills\n`;
    });
    
    summaryText += `\n🎯 Total Event Kills: ${eventState.totalKills}/450`;
    
    // End the current event if we have one
    if (currentEvent) {
        await endVoidEvent(currentEvent.event_id);
        summaryText += `\n\n🏁 **EVENT COMPLETE** - A new event will start soon!`;
        console.log(`✅ Ended event: ${currentEvent.event_id}`);
    }
    
    await channel.send(summaryText);
    console.log('✅ Grand Final summary posted');
}

/**
 * Stop event prematurely
 */
export function stopEvent() {
    if (eventState.updateInterval) {
        clearInterval(eventState.updateInterval);
        console.log('⏹️ Event stopped');
    }
}

/**
 * Get current event state
 */
export function getEventState() {
    return { ...eventState };
}

export default {
    createLiveDashboardEmbed,
    startLiveDashboardEvent,
    stopEvent,
    getEventState,
    endDay
};
