
import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import gameState from '../gameState.js';
import { getRealmkinNftsByOwner } from '../utils/solana.js';
import { getUserData, saveUserData, updateTotalMkinGained, updateTotalKills, getLeaderboard } from '../data/userWallets.js';
import { getFusedCharacter } from '../data/fusedCharacters.js';
import { generateMonster, processBattleRound, getEncounterMessage, getDifficultyMessage } from '../game/voidBattleSystem.js';
import { startLiveDashboardEvent, stopEvent, getEventState, createLiveDashboardEmbed } from '../game/voidEventManager.js';

const REQUIRED_GAME_MASTER_ROLE = 'Game Master'; // Name of the role that can start battles

/**
 * Start individual player battle (silent version for dashboard)
 */
async function startPlayerBattle(userId, playerName, channel) {
    const player = await getFusedCharacter(userId);
    if (!player) return;

    // Generate monster with current difficulty and player tier
    const monster = generateMonster(player.level, gameState.serverStats.currentDifficulty, player.tier || 1);
    
    // Create battle state
    gameState.playerBattles[userId] = {
        playerName: playerName,
        monster: monster,
        kills: 0,
        inCooldown: false
    };

    // Start battle timer (15-second rounds with multiple attacks)
    const battleTimer = setInterval(async () => {
        if (gameState.status !== 'in_progress' || gameState.playerBattles[userId]?.inCooldown) {
            return;
        }

        const battleResults = await processBattleRound(userId, gameState.playerBattles[userId]);
        if (battleResults && battleResults.length > 0) {
                // Check if any result defeated the monster
                const monsterDefeated = battleResults.some(result => result.monsterDefeated);
                if (monsterDefeated) {
                    // Ensure player battle state exists before updating
                    if (gameState.playerBattles[userId]) {
                        gameState.playerBattles[userId].kills++;
                        // Do not persist to DB here to avoid double counting.
                        // Persistence is handled centrally in runCombatCycle()
                        
                        // Record server kill
                        const difficultyChanged = gameState.recordKill();
                        if (difficultyChanged) {
                            // Difficulty changes will be shown in dashboard, not individual messages
                        }

                        // Start cooldown
                        gameState.playerBattles[userId].inCooldown = true;
                        gameState.cooldownTimers.set(userId, setTimeout(() => {
                            if (gameState.playerBattles[userId]) {
                                gameState.playerBattles[userId].inCooldown = false;
                                startPlayerBattle(userId, playerName, channel); // Start new battle
                            }
                        }, 5000)); // 5-second cooldown
                    }
                }
        }
    }, 15000); // 15-second rounds

    gameState.battleTimers.set(userId, battleTimer);
}

/**
 * End all player battles and cleanup
 */
function endAllBattles(channel) {
    // Clear all player timers
    for (const [userId, timer] of gameState.battleTimers) {
        clearInterval(timer);
        gameState.cleanupPlayerBattle(userId);
    }
    
    gameState.battleTimers.clear();
    gameState.cooldownTimers.clear();
}

/**
 * Start the void battle event with Live Dashboard
 */
async function startBattle(channel) {
    gameState.status = 'in_progress';
    gameState.initializeServerStats();
    
    // Ensure an event exists before starting the battle
    try {
        const { getCurrentEvent, createNewEvent, initializeEventSystem } = await import('../data/eventManager.js');
        
        // Check if there's an active event
        const currentEvent = await getCurrentEvent();
        if (!currentEvent) {
            console.log('No active event found. Creating a new event before starting battle...');
            const newEvent = await createNewEvent('Void Arena Event', 5, 450);
            console.log('Created new event:', newEvent?.event_id || 'Failed to create event');
            
            if (!newEvent) {
                console.error('Failed to create event! Falling back to event system initialization...');
                await initializeEventSystem();
            }
        } else {
            console.log('Using existing event:', currentEvent.event_id);
        }
    } catch (error) {
        console.error('Error ensuring event exists:', error);
    }
    
    // Start the Live Dashboard instead of individual messages
    await startLiveDashboardEvent(1, channel);

    gameState.startTime = Date.now();

    // Start battles for all joined players (but they won't send individual messages)
    for (const userId in gameState.players) {
        const player = gameState.players[userId];
        startPlayerBattle(userId, player.name, channel);
    }

    // Set battle end timer (only check kill cap for 5-day void arena events)
    gameState.battleInterval = setInterval(async () => {
        // Check if kill cap is reached
        try {
            const { getCurrentEvent, calculateEventKills } = await import('../data/eventManager.js');
            const currentEvent = await getCurrentEvent();
            
            if (currentEvent) {
                const totalKills = await calculateEventKills(currentEvent.event_id);
                console.log(`Checking kill cap: ${totalKills}/${gameState.serverStats.killCap}`);
                
                if (totalKills >= gameState.serverStats.killCap) {
                    console.log(`Kill cap reached (${totalKills}/${gameState.serverStats.killCap})! Ending battle.`);
                    channel.send(`🏆 **VOID BATTLE MILESTONE REACHED!** 🏆\n\nThe community has reached ${totalKills} kills! The Void has been conquered!`);
                    endBattle(channel);
                }
            }
        } catch (error) {
            console.error('Error checking kill cap:', error);
        }
    }, 60000); // Check every minute
}

async function endBattle(channel) {
    clearInterval(gameState.battleInterval);
    clearTimeout(gameState.joinInterval);
    gameState.status = 'ended';

    // End all individual player battles
    endAllBattles(channel);

    const scoreboardEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🏆 VOID BATTLE RESULTS 🏆')
        .setTimestamp();

    let description = '';
    let playersParticipated = false;
    let totalServerKills = 0;

    for (const userId in gameState.players) {
        playersParticipated = true;
        const player = gameState.players[userId];
        const battleKills = gameState.playerBattles[userId]?.kills || 0;
        const totalReward = battleKills * gameState.rewardPerKill;
        
        description += `${player.name} — ${battleKills} kills — 💰 ${totalReward} $MKIN\n`;
        totalServerKills += battleKills;

        // Update total stats (already updated during battle)
    }

    // Add server statistics
    description += `\n📊 **Server Total:** ${totalServerKills} kills`;
    description += `\n🎯 **Target Progress:** ${Math.round((totalServerKills / 450) * 100)}% of 5-day goal`;

    if (!playersParticipated) {
        description = 'No players participated in this battle.';
    }
    
    scoreboardEmbed.setDescription(description);

    channel.send({ embeds: [scoreboardEmbed] });
    
    // Cleanup all battle states
    gameState.playerBattles = {};
    gameState.players = {};
}

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Handle NFT verification button
        if (interaction.isButton() && interaction.customId === 'nft_verify_button') {
            const { handleVerifyButton } = await import('../interactions/verificationButton.js');
            return handleVerifyButton(interaction);
        }
        
        if (interaction.isButton() && interaction.customId === 'verify_button') {
            const member = interaction.member;
            const role = interaction.guild.roles.cache.find(r => r.name === 'Gate Key');

            if (!role) {
                console.error("The 'Gate Key' role does not exist.");
                await interaction.reply({
                    content: 'The Gate Key role is not set up correctly. Please contact an administrator.',
                    ephemeral: true
                });
                return;
            }

            if (member.roles.cache.has(role.id)) {
                 await interaction.reply({
                    content: 'You already have the Gate Key.',
                    ephemeral: true
                });
                return;
            }

            try {
                await member.roles.add(role);
                await interaction.reply({
                    content: 'You have been successfully granted the Gate Key!',
                    ephemeral: true
                });
            } catch (error) {
                console.error(`Failed to assign the 'Gate Key' role to ${member.user.tag}:`, error);
                await interaction.reply({
                    content: 'There was an error while trying to grant you the Gate Key. Please try again later or contact an administrator.',
                    ephemeral: true
                });
            }
        } else if (interaction.isCommand()) {
            if (interaction.commandName === 'void') {
                const subcommand = interaction.options.getSubcommand();
                const subcommandGroup = interaction.options.getSubcommandGroup?.() || null;

                // Handle dashboard admin commands
                if (subcommandGroup === 'dashboard') {
                    const member = interaction.member;
                    const gameMasterRole = interaction.guild.roles.cache.find(r => r.name === REQUIRED_GAME_MASTER_ROLE);
                    if (!gameMasterRole || !member.roles.cache.has(gameMasterRole.id)) {
                        return interaction.reply({ content: `You need the "${REQUIRED_GAME_MASTER_ROLE}" role to manage the dashboard.`, ephemeral: true });
                    }

                    const dashSub = subcommand; // only 'status'
                    if (dashSub === 'status') {
                        try {
                            const { getCurrentEvent, getCurrentDayNumber, getEventStatusSummary } = await import('../data/eventManager.js');
                            const currentEvent = await getCurrentEvent();
                            if (!currentEvent) {
                                return interaction.reply({ content: 'No active event found.', ephemeral: true });
                            }
                            const dayNumber = getCurrentDayNumber(currentEvent);
                            const summary = await getEventStatusSummary(currentEvent.event_id, dayNumber);
                            const state = getEventState();
                            const msg = `Event: ${currentEvent.event_id}\nDay: ${dayNumber} of ${currentEvent.total_days || 5}\nParticipants: ${summary.participants}\nToday Kills: ${summary.today_kills}\nTotal Kills: ${summary.total_kills}\nDashboard Active: ${state.updateInterval ? 'Yes' : 'No'}`;
                            return interaction.reply({ content: msg, ephemeral: true });
                        } catch (e) {
                            console.error('Error getting dashboard status:', e);
                            return interaction.reply({ content: 'Failed to get dashboard status.', ephemeral: true });
                        }
                    }

                    return; // handled
                }

                if (subcommand === 'start') {
                    const member = interaction.member;
                    const gameMasterRole = interaction.guild.roles.cache.find(r => r.name === REQUIRED_GAME_MASTER_ROLE);

                    if (!gameMasterRole || !member.roles.cache.has(gameMasterRole.id)) {
                        return interaction.reply({
                            content: `You need the "${REQUIRED_GAME_MASTER_ROLE}" role to start a VOID battle.`,
                            ephemeral: true
                        });
                    }

                    if (gameState.status !== 'ended') {
                        return interaction.reply({ content: 'A VOID battle is already in progress.', ephemeral: true });
                    }

                    gameState.status = 'waiting';
                    gameState.joinTime = 2; // Fixed 2-minute join time for void arena
                    gameState.rewardPerKill = 7; // Hardcoded to 7 MKIN per kill
                    gameState.players = {};

                    // Ensure an active event exists during the join window so participants are tracked immediately
                    try {
                        const { getCurrentEvent, createNewEvent, initializeEventSystem } = await import('../data/eventManager.js');
                        let currentEvent = await getCurrentEvent();
                        if (!currentEvent) {
                            console.log('No active event found at start of join window. Creating a new event...');
                            currentEvent = await createNewEvent('Void Arena Event', 5, 450);
                            if (!currentEvent) {
                                console.warn('Failed to create event at join window start. Attempting to initialize event system...');
                                await initializeEventSystem();
                            } else {
                                console.log('Created event for join window:', currentEvent.event_id);
                            }
                        } else {
                            console.log('Using existing active event for join window:', currentEvent.event_id);
                        }
                    } catch (err) {
                        console.error('Error ensuring event during join window:', err);
                    }

                    await interaction.reply({ content: `A 5-day VOID battle is starting! You have ${gameState.joinTime} minutes to join using /void join. Each kill rewards 7 MKIN.` });

                    gameState.joinInterval = setTimeout(() => {
                        startBattle(interaction.channel);
                    }, gameState.joinTime * 60 * 1000);

                } else if (subcommand === 'join') {
                    // Don't defer - we need to show a modal which conflicts with deferral
                    // Instead, we'll perform quick synchronous checks first

                    if (gameState.status !== 'waiting') {
                        return interaction.reply({ content: 'There is no active VOID battle to join.', ephemeral: true });
                    }

                    const member = interaction.member;
                    const role = interaction.guild.roles.cache.find(r => r.name === 'Gate Key');
                    if (!role || !member.roles.cache.has(role.id)) {
                        return interaction.reply({ content: 'You must have the "Gate Key" role to join.', ephemeral: true });
                    }

                    if (gameState.players[member.user.id]) {
                        return interaction.reply({ content: 'You have already joined the current battle!', ephemeral: true });
                    }

                    // Show modal immediately to prevent timeout, then validate in modal submit handler
                    const modal = new ModalBuilder()
                        .setCustomId('void_battle_name_modal')
                        .setTitle('Enter Your Battle Name');

                    const nameInput = new TextInputBuilder()
                        .setCustomId('battle_name_input')
                        .setLabel("What name will you fight under?")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(25);

                    const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
                    modal.addComponents(firstActionRow);

                    await interaction.showModal(modal);

                } else if (subcommand === 'balance') {
                    const userId = interaction.user.id;
                    const userData = await getUserData(userId); // Use getUserData

                    if (!userData || !userData.wallet_address) {
                        return interaction.reply({
                            content: 'You need to link your Solana wallet first using the `/check-nft` command to check your Realmkin balance.',
                            ephemeral: true
                        });
                    }

                    await interaction.deferReply({ ephemeral: true }); // Defer to allow time for API call

                    const userNfts = await getRealmkinNftsByOwner(userData.wallet_address);
                    const totalMkinGained = userData.total_mkin_gained || 0; // Get from userData
                    const totalKills = userData.total_kills || 0; // Get total kills from userData

                    let replyContent;
                    if (userNfts.length > 0) {
                        const nftList = userNfts.map(nft => `- ${nft.label}`).join('\n');
                        replyContent = `You currently hold ${userNfts.length} Realmkin NFT(s):\n${nftList}\n\nTotal $MKIN Gained from VOID battles: 💰 ${totalMkinGained}\nTotal Kills in VOID battles: 💀 ${totalKills}`;
                    } else {
                        replyContent = `You do not currently hold any Realmkin NFTs.\n\nTotal $MKIN Gained from VOID battles: 💰 ${totalMkinGained}\nTotal Kills in VOID battles: 💀 ${totalKills}`;
                    }
                    await interaction.editReply({ content: replyContent, ephemeral: true });

                } else if (subcommand === 'leaderboard') {
                    await interaction.deferReply(); // Leaderboard can be public

                    // Get current event and use event-based leaderboard
                    const { getCurrentEvent, getEventLeaderboard } = await import('../data/eventManager.js');
                    const currentEvent = await getCurrentEvent();
                    
                    let topPlayers = [];
                    if (currentEvent) {
                        topPlayers = await getEventLeaderboard(currentEvent.event_id, 10);
                    } else {
                        // Fallback to old system if no active event
                        topPlayers = await getLeaderboard();
                    }

                    const leaderboardEmbed = new EmbedBuilder()
                        .setColor('#FFD700') // Gold color
                        .setTitle('👑 VOID BATTLE LEADERBOARD 👑')
                        .setTimestamp();
                    
                    let leaderboardDescription = '';
                    if (topPlayers.length === 0) {
                        leaderboardDescription = 'No players on the leaderboard yet. Be the first to join a VOID battle!';
                    } else {
                        topPlayers.forEach((player, index) => {
                            // Use event-based kills if available, otherwise fall back to legacy fields
                            const kills = player.kills !== undefined ? player.kills : 
                                         (player.event_kills !== undefined ? player.event_kills : 0);
                            const mkinEarned = player.mkin_earned !== undefined ? player.mkin_earned : 
                                              (player.total_mkin_gained !== undefined ? player.total_mkin_gained : 0);
                            
                            leaderboardDescription += `**#${index + 1}** ${player.display_name || 'Anonymous'} — ${kills} VOID Kills — 💰 ${mkinEarned} $MKIN\n`;
                        });
                    }
                    leaderboardEmbed.setDescription(leaderboardDescription);

                    await interaction.editReply({ embeds: [leaderboardEmbed] });

                } else if (subcommand === 'cancel') {
                    const member = interaction.member;
                    const gameMasterRole = interaction.guild.roles.cache.find(r => r.name === REQUIRED_GAME_MASTER_ROLE);

                    if (!gameMasterRole || !member.roles.cache.has(gameMasterRole.id)) {
                        return interaction.reply({
                            content: `You need the "${REQUIRED_GAME_MASTER_ROLE}" role to cancel a VOID battle.`,
                            ephemeral: true
                        });
                    }

                    if (gameState.status === 'ended') {
                        return interaction.reply({ content: 'There is no active VOID battle to cancel.', ephemeral: true });
                    }

                    // Clean up all battle state
                    clearInterval(gameState.battleInterval);
                    clearTimeout(gameState.joinInterval);
                    endAllBattles(interaction.channel);
                    gameState.status = 'ended';
                    gameState.playerBattles = {};
                    gameState.players = {};

                    await interaction.reply({ content: 'The VOID battle has been cancelled.', ephemeral: false });
                }
        } else {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`[Command Error] ${interaction.commandName}:`, error);
                
                // Use editReply if already deferred, otherwise reply
                const errorMessage = 'There was an error while executing this command!';
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: errorMessage }).catch(console.error);
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true }).catch(console.error);
                }
            }
        }
    } else if (interaction.isButton() && interaction.customId.startsWith('profile_')) {
        // Handle profile navigation buttons
        const { handleProfileNavigation } = await import('../commands/profile.js');
        await handleProfileNavigation(interaction);
        } else if (interaction.isStringSelectMenu() && interaction.customId === 'select_train_nft') {
            const selectedValues = interaction.values;
            const userId = interaction.user.id;
            const nftId = selectedValues[0]; // Only one NFT selected for training

            const allUserNfts = interaction.client.tempFullNftsData ? interaction.client.tempFullNftsData[userId] : [];
            const selectedNft = allUserNfts.find(nft => nft.value === nftId);

            if (!selectedNft) {
                return interaction.reply({ 
                    content: '❌ Error: Selected NFT not found. Please try again.', 
                    ephemeral: true 
                });
            }

            // Clean up temporary data
            if (interaction.client.tempFullNftsData) {
                delete interaction.client.tempFullNftsData[userId];
            }

            // Process training with the selected NFT using interactive battle system
            await interaction.deferReply({ ephemeral: true });

            try {
                const { fetchAndCacheNftMetadata } = await import('../utils/nftMetadata.js');
                const { getOrCreateRealmkin } = await import('../data/realmkins.js');
                const { generateTrainingEnemy, calculateTotalStats } = await import('../game/combatEngine.js');
                const { startInteractiveBattle } = await import('../game/battleSystem.js');

                // Get NFT metadata and realmkin data
                const [metadata, realmkin] = await Promise.all([
                    fetchAndCacheNftMetadata(nftId),
                    getOrCreateRealmkin(nftId, userId)
                ]);

                if (metadata.error) {
                    return interaction.editReply({
                        content: '❌ Failed to fetch NFT metadata. Please try again.',
                        ephemeral: true
                    });
                }

                // Calculate total stats
                const totalStats = calculateTotalStats(realmkin, metadata);

                // Generate enemy based on player's tier level if available
                const enemy = generateTrainingEnemy(realmkin.tier_level || realmkin.level);

                // Prepare combat data for interactive battle
                const playerData = {
                    nftId: nftId,
                    userId: userId,
                    name: metadata.name,
                    level: realmkin.level,
                    rarity: metadata.rarity,
                    element: metadata.element,
                    attack: totalStats.attack,
                    defense: totalStats.defense,
                    health: totalStats.health,
                    maxHealth: totalStats.maxHealth
                };

                // Start interactive battle
                await startInteractiveBattle(interaction, playerData, enemy);

            } catch (error) {
                console.error('Error starting interactive battle:', error);
                await interaction.editReply({
                    content: '❌ An error occurred while starting the battle. Please try again.',
                    ephemeral: true
                });
            }

        } else if (interaction.isModalSubmit() && interaction.customId === 'void_battle_name_modal') {
             const battleName = interaction.fields.getTextInputValue('battle_name_input');
             const userId = interaction.user.id;

             // Trim battleName to remove leading/trailing whitespace
             const trimmedBattleName = battleName.trim();

             if (trimmedBattleName === '') {
                 return interaction.reply({ content: 'Please enter a valid battle name.', ephemeral: true });
             }

             // Defer reply since we need to do async operations
             await interaction.deferReply({ ephemeral: true });

             // Check if battle is still waiting for players
             if (gameState.status !== 'waiting') {
                 return interaction.editReply({ content: 'The battle has already started or ended. You can no longer join.', ephemeral: true });
             }

             // Check if player already joined
             if (gameState.players[userId]) {
                 return interaction.editReply({ content: 'You have already joined the current battle!', ephemeral: true });
             }

             // Retrieve existing user data and validate wallet
             const existingUserData = await getUserData(userId);
             const userWalletAddress = existingUserData ? existingUserData.wallet_address : null;

             if (!userWalletAddress) {
                 return interaction.editReply({ 
                     content: 'Error: No linked wallet found. Please link your wallet using /check-nft first.', 
                     ephemeral: true 
                 });
             }

             // Check if player has a fused character
             const fusedCharacter = await getFusedCharacter(userId);
             if (!fusedCharacter) {
                 return interaction.editReply({ 
                     content: 'You need to create a fused character first. Use /train to fuse your Realmkin NFTs into a champion!',
                     ephemeral: true
                 });
             }

             // Save or update user data with battle name
             await saveUserData(userId, userWalletAddress, trimmedBattleName);

             // Add player to battle with empty NFT array (using fused character)
             gameState.players[userId] = {
                 name: trimmedBattleName,
                 nfts: [], // Empty since we use fused character
                 kills: 0,
                 deaths: 0,
             };
             
             try {
                 // Also add player to the current event's participation table
                 const { getCurrentEvent, addPlayerToEvent } = await import('../data/eventManager.js');
                 const currentEvent = await getCurrentEvent();
                 
                 if (currentEvent) {
                     console.log(`Adding player ${userId} (${trimmedBattleName}) to event ${currentEvent.event_id}`);
                     
                     // Add player to event (creates initial participation record)
                     const result = await addPlayerToEvent(userId);
                     
                     if (result) {
                         console.log(`✅ Successfully added player ${userId} to event ${currentEvent.event_id}`);
                     } else {
                         console.log(`ℹ️ Player ${userId} already exists in event ${currentEvent.event_id} or failed to add`);
                     }
                 } else {
                     console.warn('No active event found when player joined. Player will not appear in leaderboard.');
                 }
             } catch (error) {
                 console.error('Error adding player to event:', error);
             }

             await interaction.editReply({ content: `You have successfully joined the battle as "${trimmedBattleName}"! Your fused champion is ready for combat!`, ephemeral: true });
        }

        // Handle username modal submission
        else if (interaction.isModalSubmit() && interaction.customId === 'usernameModal') {
            const { handleUsernameModal } = await import('../commands/username.js');
            await handleUsernameModal(interaction);
        }

        // PvP buttons (accept / decline / start)
        if (interaction.isButton() && interaction.customId?.startsWith('pvp_')) {
            const { handlePvPButtonInteraction } = await import('../interactions/pvpButtons.js');
            return handlePvPButtonInteraction(interaction);
        }

        // Handle battle interactions (buttons and select menus)
        else {
            console.log('Routing to battle interaction handler:', interaction.customId, interaction.type);
            
            // Try to handle with fused battle system first
            try {
                const { handleFusedBattleInteraction } = await import('../game/fusedBattleSystem.js');
                await handleFusedBattleInteraction(interaction);
            } catch (fusedError) {
                console.log('Fused battle handler failed, trying legacy battle system:', fusedError.message);
                
                // Fall back to legacy battle system for individual NFT battles
                try {
                    const { handleBattleInteraction } = await import('../game/battleSystem.js');
                    await handleBattleInteraction(interaction);
                } catch (error) {
                    console.error('Error in battle interaction handler:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: '❌ Failed to process battle action.', 
                            ephemeral: true 
                        });
                    }
                }
            }
        }
    },
};
