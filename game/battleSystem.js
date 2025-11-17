import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { executeCombatTurn, generateTrainingEnemy, calculateTotalStats } from './combatEngine.js';
import { getElementMultiplier } from '../utils/nftMetadata.js';
import { getUserInventory } from '../data/realmkins.js';

// Battle state management
const activeBattles = new Map();

// Elemental attack options based on element type
const ELEMENTAL_ATTACKS = {
  FIRE: ['Ember', 'Fire Lash', 'Inferno Claw', 'Flame Burst'],
  NATURE: ['Vine Whip', 'Thorn Toss', 'Leaf Blade', 'Nature Grasp'],
  LIGHTNING: ['Spark Shock', 'Lightning Strike', 'Thunder Clap', 'Volt Tackle'],
  LIGHT: ['Radiant Beam', 'Holy Smite', 'Divine Light', 'Purifying Strike'],
  NEUTRAL: ['Tackle', 'Quick Attack', 'Headbutt', 'Swift Strike']
};

// Attack damage multipliers
const ATTACK_POWER = {
  'Ember': 0.8, 
  'Fire Lash': 1.0, 
  'Inferno Claw': 1.2, 
  'Flame Burst': 1.5,
  'Vine Whip': 0.8, 
  'Thorn Toss': 1.0, 
  'Leaf Blade': 1.2, 
  'Nature Grasp': 1.5,
  'Spark Shock': 0.8, 
  'Lightning Strike': 1.0, 
  'Thunder Clap': 1.2, 
  'Volt Tackle': 1.5,
  'Radiant Beam': 0.9, 
  'Holy Smite': 1.1, 
  'Divine Light': 1.3, 
  'Purifying Strike': 1.6,
  'Tackle': 0.7, 
  'Quick Attack': 0.9, 
  'Headbutt': 0.8, 
  'Swift Strike': 1.0
};

/**
 * Initialize a new interactive battle
 */
export const startInteractiveBattle = async (interaction, playerData, enemy) => {
  const battleId = `${interaction.user.id}-${Date.now()}`;
  
  const battleState = {
    player: {
      ...playerData,
      currentHealth: playerData.health,
      maxHealth: playerData.maxHealth
    },
    enemy: {
      ...enemy,
      currentHealth: enemy.health,
      maxHealth: enemy.health
    },
    turn: 'player', // player or enemy
    phase: 'action', // action, attack_select, item_select
    battleLog: [`A wild ${enemy.name} appears! What will you do?`],
    message: null
  };

  activeBattles.set(battleId, battleState);

  // Create initial battle embed and components
  const { embed, components } = await createBattleEmbed(battleState, battleId);
  
  const message = await interaction.editReply({ 
    embeds: [embed],
    components 
  });

  battleState.message = message;
  activeBattles.set(battleId, battleState);

  return battleId;
};

/**
 * Create battle embed with current state
 */
const createBattleEmbed = async (battleState, battleId) => {
  const { player, enemy, battleLog } = battleState;

  // Create health bars
  const playerHealthBar = generateHealthBar(player.currentHealth, player.maxHealth);
  const enemyHealthBar = generateHealthBar(enemy.currentHealth, enemy.maxHealth);

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Training Grounds: ${player.name} vs. ${enemy.name}`)
    .setColor(0x0099FF)
    .addFields(
      {
        name: '🧙‍♂️ Your Realmkin',
        value: `**${player.name}**\n⭐ Level ${player.level} ${player.rarity} ${player.element}\n❤️ **HP:** ${player.currentHealth}/${player.maxHealth}\n${playerHealthBar}`,
        inline: true
      },
      {
        name: '🧌 Enemy',
        value: `**${enemy.name}**\n⭐ Level ${enemy.level} ${enemy.rarity} ${enemy.element}\n💔 **HP:** ${enemy.currentHealth}/${enemy.maxHealth}\n${enemyHealthBar}`,
        inline: true
      },
      {
        name: '📜 Battle Log',
        value: battleLog.slice(-3).join('\n') || 'Battle begins!',
        inline: false
      }
    )
    .setFooter({ text: `Battle ID: ${battleId.slice(-8)}` })
    .setTimestamp();

  let components = [];

  if (battleState.phase === 'action') {
    components = [createActionRow()];
  } else if (battleState.phase === 'attack_select') {
    components = [createAttackMenu(player)];
  } else if (battleState.phase === 'item_select') {
    components = [await createItemMenu(battleState.player.userId)];
  }

  return { embed, components };
};

/**
 * Generate health bar visualization
 */
const generateHealthBar = (current, max, length = 10) => {
  const percentage = current / max;
  const filled = Math.floor(percentage * length);
  const empty = length - filled;
  
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.floor(percentage * 100)}%`;
};

/**
 * Create action buttons row
 */
const createActionRow = () => {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('battle_attack')
        .setLabel('⚔️ Attack')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('battle_items')
        .setLabel('🎒 Items')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('battle_flee')
        .setLabel('🏃 Flee')
        .setStyle(ButtonStyle.Secondary)
    );
};

/**
 * Create attack selection menu for fused characters with multiple elements
 */
const createAttackMenu = (player) => {
  // For fused characters, allow attacks from all elements they have affinity for
  const availableElements = [];
  
  if (player.elementalAffinities) {
    // If player has elemental affinities object, use all elements with > 0 affinity
    for (const [element, affinity] of Object.entries(player.elementalAffinities)) {
      if (affinity > 0) {
        availableElements.push(element);
      }
    }
  } else if (player.element) {
    // For regular characters, just use their single element
    availableElements.push(player.element);
  }
  
  // If no elements found, default to NEUTRAL
  if (availableElements.length === 0) {
    availableElements.push('NEUTRAL');
  }
  
  // Get all unique attacks from available elements
  const allAttacks = new Set();
  availableElements.forEach(element => {
    const elementAttacks = ELEMENTAL_ATTACKS[element] || ELEMENTAL_ATTACKS.NEUTRAL;
    elementAttacks.forEach(attack => allAttacks.add(attack));
  });
  
  const attacks = Array.from(allAttacks);
  
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('battle_attack_select')
        .setPlaceholder('Select an elemental attack...')
        .addOptions(
          attacks.map(attack => ({
            label: attack,
            value: attack.toLowerCase().replace(/\s+/g, '_'),
            description: `Power: ${ATTACK_POWER[attack] * 100}%`
          }))
        )
    );
};

/**
 * Create item selection menu
 */
const createItemMenu = async (userId) => {
  const inventory = await getUserInventory(userId);
  const usableItems = inventory.filter(item => 
    item.item_type.includes('POTION') || item.item_type.includes('BOOST')
  );

  // Ensure we have at least 1 option and no more than 25
  let options = usableItems.slice(0, 25).map(item => ({
    label: item.item_type.replace(/_/g, ' '),
    value: item.item_type,
    description: `Quantity: ${item.quantity}`
  }));

  if (options.length === 0) {
    // If no usable items, show back button instead of disabled menu
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('battle_back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      );
  } else {
    // If items available, show the select menu
    return new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('battle_item_select')
          .setPlaceholder('Select an item to use...')
          .addOptions(options)
      );
  }
};

/**
 * Process player attack
 */
export const processPlayerAttack = async (interaction, battleId, attackName) => {
  const battleState = activeBattles.get(battleId);
  if (!battleState || battleState.turn !== 'player') return;

  const { player, enemy } = battleState;
  
  // Calculate damage
  const baseAttack = ATTACK_POWER[attackName] || 1.0;
  const elementMultiplier = getElementMultiplier(player.element, enemy.element);
  const damage = Math.floor(player.attack * baseAttack * elementMultiplier - enemy.defense);
  const finalDamage = Math.max(1, damage);

  // Update enemy health
  enemy.currentHealth = Math.max(0, enemy.currentHealth - finalDamage);

  // Add to battle log
  battleState.battleLog.push(`**${player.name}** used ${attackName}!`);
  battleState.battleLog.push(`It dealt ${finalDamage} damage${elementMultiplier > 1 ? ' 💥 (Super Effective!)' : elementMultiplier < 1 ? ' ⚡ (Not Very Effective)' : ''}`);

  // Check if enemy is defeated
  if (enemy.currentHealth <= 0) {
    battleState.battleLog.push(`🎉 **${enemy.name} was defeated!**`);
    await endBattle(interaction, battleId, 'victory');
    return;
  }

  battleState.turn = 'enemy';
  battleState.phase = 'action';

  // Update message
  const { embed, components } = await createBattleEmbed(battleState, battleId);
  try {
    await battleState.message.edit({ embeds: [embed], components });
  } catch (error) {
    if (error.code === 10008) { // Unknown Message error
      console.log('Message not found in processPlayerAttack, creating new message...');
      const newMessage = await interaction.channel.send({ 
        embeds: [embed], 
        components 
      });
      battleState.message = newMessage;
    } else {
      throw error;
    }
  }

  // Process enemy turn after a delay
  setTimeout(() => processEnemyTurn(interaction, battleId), 1500);
};

/**
 * Process enemy turn
 */
const processEnemyTurn = async (interaction, battleId) => {
  const battleState = activeBattles.get(battleId);
  if (!battleState || battleState.turn !== 'enemy') return;

  const { player, enemy } = battleState;

  // Simple enemy AI - just basic attack
  const enemyAttack = 'Tackle';
  const damage = Math.floor(enemy.attack * 0.8 - player.defense);
  const finalDamage = Math.max(1, damage);

  // Update player health
  player.currentHealth = Math.max(0, player.currentHealth - finalDamage);

  // Add to battle log
  battleState.battleLog.push(`**${enemy.name}** attacks with ${enemyAttack}!`);
  battleState.battleLog.push(`It deals ${finalDamage} damage to you!`);

  // Check if player is defeated
  if (player.currentHealth <= 0) {
    battleState.battleLog.push(`💀 **You were defeated!**`);
    await endBattle(interaction, battleId, 'defeat');
    return;
  }

  battleState.turn = 'player';
  battleState.phase = 'action';

  // Update message
  const { embed, components } = await createBattleEmbed(battleState, battleId);
  await battleState.message.edit({ embeds: [embed], components });
};

/**
 * End battle and cleanup
 */
const endBattle = async (interaction, battleId, result) => {
  const battleState = activeBattles.get(battleId);
  if (!battleState) return;

  try {
    // Remove components
    await battleState.message.edit({ components: [] });

    let xpGained = 0;
    let lootItem = null;

  // Process rewards if victory
  if (result === 'victory') {
    // Use the combat engine to process XP and loot
    const combatResult = await executeCombatTurn(
      battleState.player,
      battleState.enemy,
      'training'
    );
    
    xpGained = combatResult.xpGained;
    lootItem = combatResult.lootItem;
    
    // Ensure XP is always awarded (minimum 5 XP)
    if (xpGained === 0) {
      xpGained = 5; // Fallback minimum XP
      console.log('XP was 0, setting to minimum 5 XP');
    }
    
    battleState.battleLog.push(`✨ You gained ${xpGained} XP${lootItem ? ' and found some loot!' : '!'}`);
    
    const rewardsText = `⭐ ${xpGained} XP${lootItem ? `\n🎁 1 ${lootItem.replace(/_/g, ' ')}` : ''}`;
      
      const finalEmbed = new EmbedBuilder()
        .setTitle('🎉 Victory!')
        .setColor(0x00FF00)
        .setDescription(battleState.battleLog.join('\n'))
        .addFields(
          {
            name: 'Rewards',
            value: rewardsText,
            inline: true
          }
        );

      await battleState.message.edit({ embeds: [finalEmbed] });
    } else if (result === 'defeat') {
      const finalEmbed = new EmbedBuilder()
        .setTitle('💀 Defeat')
        .setColor(0xFF0000)
        .setDescription(battleState.battleLog.join('\n'));

      await battleState.message.edit({ embeds: [finalEmbed] });
    } else if (result === 'fled') {
      const finalEmbed = new EmbedBuilder()
        .setTitle('🏃 Flee')
        .setColor(0xFFFF00)
        .setDescription(battleState.battleLog.join('\n'));

      await battleState.message.edit({ embeds: [finalEmbed] });
    }
  } catch (error) {
    if (error.code === 10008) { // Unknown Message error
      console.log('Message not found in endBattle, creating new message...');
      const finalEmbed = new EmbedBuilder()
        .setTitle(result === 'victory' ? '🎉 Victory!' : result === 'defeat' ? '💀 Defeat' : '🏃 Flee')
        .setColor(result === 'victory' ? 0x00FF00 : result === 'defeat' ? 0xFF0000 : 0xFFFF00)
        .setDescription(battleState.battleLog.join('\n'));
      
      if (result === 'victory') {
        finalEmbed.addFields({
          name: 'Rewards',
          value: '⭐ 20 XP',
          inline: true
        });
      }

      await interaction.channel.send({ embeds: [finalEmbed] });
    } else {
      console.error('Error in endBattle:', error);
      // Try to send a simple message if all else fails
      await interaction.channel.send(
        result === 'victory' ? '🎉 Victory! Check your rewards.' : 
        result === 'defeat' ? '💀 You were defeated!' : '🏃 You fled from battle!'
      );
    }
  }

  activeBattles.delete(battleId);
};

/**
 * Handle battle interactions
 */
export const handleBattleInteraction = async (interaction) => {
  console.log('Battle interaction received:', interaction.customId, interaction.type);
  
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
    console.log('Interaction is not a button or select menu');
    return;
  }

  // Find battle ID by user ID - battle IDs are in format "userId-timestamp"
  const battleId = Array.from(activeBattles.keys()).find(id => {
    const [userId] = id.split('-');
    return userId === interaction.user.id;
  });
  if (!battleId) {
    console.log('No active battle found for user:', interaction.user.id);
    return;
  }

  const battleState = activeBattles.get(battleId);
  if (!battleState) {
    console.log('Battle state not found for battle ID:', battleId);
    return;
  }

  console.log('Found battle state:', battleState.phase, battleState.turn);

  try {
    // Check if interaction is already responded to or expired
    if (interaction.replied || interaction.deferred) {
      console.log('Interaction already handled, skipping');
      return;
    }
    
    await interaction.deferUpdate();
    console.log('Interaction deferred successfully');

    if (interaction.isButton()) {
      console.log('Button interaction:', interaction.customId);
      switch (interaction.customId) {
        case 'battle_attack':
          battleState.phase = 'attack_select';
          console.log('Changed phase to attack_select');
          break;
        case 'battle_items':
          battleState.phase = 'item_select';
          console.log('Changed phase to item_select');
          break;
        case 'battle_flee':
          battleState.battleLog.push('🏃 You fled from battle!');
          console.log('Fleeing from battle');
          await endBattle(interaction, battleId, 'fled');
          return;
      }
    } else if (interaction.isStringSelectMenu()) {
      console.log('Select menu interaction:', interaction.customId);
    if (interaction.customId === 'battle_attack_select') {
      console.log('Processing attack selection:', interaction.values[0]);
      // Convert the selected value back to proper attack name format
      const attackName = interaction.values[0]
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      await processPlayerAttack(interaction, battleId, attackName);
      return;
    } else if (interaction.customId === 'battle_item_select') {
      console.log('Processing item selection:', interaction.values[0]);
      await processItemUse(interaction, battleId, interaction.values[0]);
      return;
    }
    }

    // Handle back button
    if (interaction.customId === 'battle_back') {
      console.log('Back button pressed, returning to action phase');
      battleState.phase = 'action';
    }

    // Update message with new state
    console.log('Updating battle message with new state');
    const { embed, components } = await createBattleEmbed(battleState, battleId);
    
    try {
      await battleState.message.edit({ embeds: [embed], components });
      console.log('Battle message updated successfully');
    } catch (error) {
      if (error.code === 10008) { // Unknown Message error
        console.log('Message not found, creating new message...');
        // Create a new message and update the battle state reference
        const newMessage = await interaction.channel.send({ 
          embeds: [embed], 
          components 
        });
        battleState.message = newMessage;
        console.log('New battle message created');
      } else {
        throw error; // Re-throw other errors
      }
    }

  } catch (error) {
    console.error('Error handling battle interaction:', error);
    // Try to reply with error if deferUpdate failed
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ An error occurred processing your action.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Process item use during battle
 */
const processItemUse = async (interaction, battleId, itemType) => {
  const battleState = activeBattles.get(battleId);
  if (!battleState || battleState.turn !== 'player') return;

  const { player } = battleState;
  
  // Handle different item types
  switch (itemType) {
    case 'HEALTH_POTION':
      const healAmount = 50;
      player.currentHealth = Math.min(player.maxHealth, player.currentHealth + healAmount);
      battleState.battleLog.push(`💖 Used **Health Potion** and recovered ${healAmount} HP!`);
      break;
      
    case 'ATTACK_BOOST_1H':
      battleState.battleLog.push(`⚡ Used **Attack Boost**! (Not implemented yet)`);
      break;
      
    case 'DEFENSE_BOOST_1H':
      battleState.battleLog.push(`🛡️ Used **Defense Boost**! (Not implemented yet)`);
      break;
      
    case 'XP_BOOST_1H':
      battleState.battleLog.push(`🌟 Used **XP Boost**! (Not implemented yet)`);
      break;
      
    default:
      battleState.battleLog.push(`❌ Used **${itemType.replace(/_/g, ' ')}** but it had no effect!`);
      break;
  }

  battleState.turn = 'enemy';
  battleState.phase = 'action';

  // Update message
  const { embed, components } = await createBattleEmbed(battleState, battleId);
  try {
    await battleState.message.edit({ embeds: [embed], components });
  } catch (error) {
    if (error.code === 10008) { // Unknown Message error
      console.log('Message not found in processItemUse, creating new message...');
      const newMessage = await interaction.channel.send({ 
        embeds: [embed], 
        components 
      });
      battleState.message = newMessage;
    } else {
      throw error;
    }
  }

  // Process enemy turn after a delay
  setTimeout(() => processEnemyTurn(interaction, battleId), 1500);
};

export default {
  startInteractiveBattle,
  handleBattleInteraction,
  processPlayerAttack
};
