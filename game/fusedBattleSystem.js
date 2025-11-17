import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import {
  executeFusedCombatTurn,
  generateTrainingEnemy,
  getAvailableElements,
  getPrimaryElement,
  getXpForNextLevel,
} from "./fusedCombatEngine.js";
import { getElementMultiplier } from "../utils/nftMetadata.js";
import { getUserInventory, decrementItemQuantity, getUserItemByType } from "../data/realmkins.js";
import { getFusedCharacter } from "../data/fusedCharacters.js";

// Battle state management
const activeBattles = new Map();

// Elemental attack options based on element type
const ELEMENTAL_ATTACKS = {
  FIRE: ["Ember", "Fire Lash", "Inferno Claw", "Flame Burst"],
  NATURE: ["Vine Whip", "Thorn Toss", "Leaf Blade", "Nature Grasp"],
  LIGHTNING: ["Spark Shock", "Lightning Strike", "Thunder Clap", "Volt Tackle"],
  LIGHT: ["Radiant Beam", "Holy Smite", "Divine Light", "Purifying Strike"],
  NEUTRAL: ["Tackle", "Quick Attack", "Headbutt", "Swift Strike"],
};

// Attack sprites (emoji representations)
const ATTACK_SPRITES = {
  Ember: "🔥",
  "Fire Lash": "🔥🌀",
  "Inferno Claw": "🔥🐾",
  "Flame Burst": "🔥💥",
  "Vine Whip": "🌿🌀",
  "Thorn Toss": "🌿🎯",
  "Leaf Blade": "🍃⚔️",
  "Nature Grasp": "🌿✋",
  "Spark Shock": "⚡🌀",
  "Lightning Strike": "⚡🌩️",
  "Thunder Clap": "⚡👏",
  "Volt Tackle": "⚡💥",
  "Radiant Beam": "✨💫",
  "Holy Smite": "✨⚡",
  "Divine Light": "✨🌟",
  "Purifying Strike": "✨⚔️",
  Tackle: "💥",
  "Quick Attack": "⚡",
  Headbutt: "💢",
  "Swift Strike": "🌀⚔️",
};

// Attack damage multipliers
const ATTACK_POWER = {
  Ember: 0.8,
  "Fire Lash": 1.0,
  "Inferno Claw": 1.2,
  "Flame Burst": 1.5,
  "Vine Whip": 0.8,
  "Thorn Toss": 1.0,
  "Leaf Blade": 1.2,
  "Nature Grasp": 1.5,
  "Spark Shock": 0.8,
  "Lightning Strike": 1.0,
  "Thunder Clap": 1.2,
  "Volt Tackle": 1.5,
  "Radiant Beam": 0.9,
  "Holy Smite": 1.1,
  "Divine Light": 1.3,
  "Purifying Strike": 1.6,
  Tackle: 0.7,
  "Quick Attack": 0.9,
  Headbutt: 0.8,
  "Swift Strike": 1.0,
};

/**
 * Initialize a new interactive battle for fused characters
 */
export const startFusedBattle = async (interaction, playerData, enemy, battleType = "training", onBattleEnd = null) => {
  const battleId = `${interaction.user.id}-${Date.now()}`;

  const battleState = {
    player: {
      ...playerData,
      currentHealth: playerData.current_hp || playerData.max_hp,
      maxHealth: playerData.max_hp,
      defense: playerData.total_defense || playerData.defense || 50,
    },
    enemy: {
      ...enemy,
      currentHealth: enemy.health,
      maxHealth: enemy.health,
    },
    turn: "player", // player or enemy
    phase: "action", // action, attack_select, item_select
    battleLog: [`🌄 **Training Session Started!**`],
    sessionLog: [`A wild ${enemy.name} appears! What will you do?`],
    message: null,
    battleType: battleType, // training or other types
    battlesWon: 0,
    totalXPGained: 0,
    totalLoot: [],
    isEphemeral: true, // Track that this is an ephemeral battle
    originalInteraction: interaction, // Store reference to original interaction for follow-up messages
    onBattleEnd: typeof onBattleEnd === 'function' ? onBattleEnd : null,
  };

  activeBattles.set(battleId, battleState);

  // Create initial battle embeds and components
  const { embeds, components } = await createFusedBattleEmbed(
    battleState,
    battleId
  );

  let message;
  if (battleState.battleType === 'training') {
    message = await interaction.editReply({
      embeds,
      components,
    });
  }

  battleState.message = message;
  activeBattles.set(battleId, battleState);

  return battleId;
};

/**
 * Create battle embed with current state for fused characters
 */
const createFusedBattleEmbed = async (battleState, battleId) => {
  const { player, enemy, battleLog } = battleState;

  // Create health bars
  const playerHealthBar = generateHealthBar(
    player.currentHealth,
    player.maxHealth
  );
  const enemyHealthBar = generateHealthBar(
    enemy.currentHealth,
    enemy.maxHealth
  );

  // Option B: two-embed layout
  // Embed A: Art only (if available)
  let artEmbed = null;
  if (enemy.image_url) {
    artEmbed = new EmbedBuilder()
      .setTitle(`⚔️ Training Grounds`)
      .setImage(enemy.image_url)
      .setColor(0x0099ff);
  }

  // Embed B: Stats and log
  const statsEmbed = new EmbedBuilder()
    .setTitle(`${player.username} vs. ${enemy.name}`)
    .setColor(0x0099ff)
    .addFields(
      {
        name: "🧙‍♂️ Your Champion",
        value: `**${player.username}**\n🏅 Tier ${player.tier || 1} • ⭐ Level ${player.level} ${player.archetype}\n❤️ **HP:** ${player.currentHealth}/${player.maxHealth}\n${playerHealthBar}`,
        inline: true,
      },
      {
        name: "🧌 Enemy",
        value: `**${enemy.name}**\n⭐ Level ${enemy.level} ${enemy.rarity} ${enemy.element}\n💔 **HP:** ${enemy.currentHealth}/${enemy.maxHealth}\n${enemyHealthBar}`,
        inline: true,
      },
      ...(enemy.lore ? [{ name: "📖 Lore", value: `_${enemy.lore}_`, inline: false }] : []),
      {
        name: "📜 Battle Log",
        value: battleLog.slice(-3).join("\n") || "Battle begins!",
        inline: false,
      }
    )
    .setFooter({ text: `Battle ID: ${battleId.slice(-8)}` })
    .setTimestamp();

  let components = [];

  if (battleState.phase === "action") {
    components = [createActionRow()];
  } else if (battleState.phase === "attack_select") {
    components = [createFusedAttackMenu(player)];
  } else if (battleState.phase === "item_select") {
    components = [await createItemMenu(battleState.player.user_id)];
  }

  return { embeds: artEmbed ? [artEmbed, statsEmbed] : [statsEmbed], components };
};

/**
 * Show training session summary
 */
const showTrainingSessionSummary = async (interaction, battleState) => {
  if (!battleState) return;

  const summaryEmbed = new EmbedBuilder()
    .setTitle("🏁 Training Session Completed!")
    .setColor(0x00ff00)
    .setDescription(`**Session Summary for ${battleState.player.username}**`)
    .addFields(
      {
        name: "📊 Performance",
        value: `Battles Won: ${battleState.battlesWon}\nTotal XP Gained: ${battleState.totalXPGained}`,
        inline: true,
      },
      {
        name: "🎁 Loot Collected",
        value:
          battleState.totalLoot.length > 0
            ? battleState.totalLoot
                .map((item) => `• ${item.replace(/_/g, " ")}`)
                .join("\n")
            : "No loot collected",
        inline: true,
      }
    )
    .setFooter({ text: "Use /train to start another session!" })
    .setTimestamp();

  await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
};

/**
 * Generate health bar visualization
 */
const generateHealthBar = (current, max, length = 10) => {
  const percentage = current / max;
  const filled = Math.floor(percentage * length);
  const empty = length - filled;

  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${Math.floor(
    percentage * 100
  )}%`;
};

/**
 * Create action buttons row
 */
const createActionRow = () => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("battle_attack")
      .setLabel("⚔️ Attack")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("battle_items")
      .setLabel("🎒 Items")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("battle_flee")
      .setLabel("🏃 Flee")
      .setStyle(ButtonStyle.Secondary)
  );
};

/**
 * Create attack selection menu for fused characters with multiple elements
 */
const createFusedAttackMenu = (player) => {
  const availableElements = getAvailableElements(player);

  // Get all unique attacks from available elements
  const allAttacks = new Set();
  availableElements.forEach((element) => {
    const elementAttacks =
      ELEMENTAL_ATTACKS[element] || ELEMENTAL_ATTACKS.NEUTRAL;
    elementAttacks.forEach((attack) => allAttacks.add(attack));
  });

  const attacks = Array.from(allAttacks);

  // Add elemental indicators and damage bonus info
  const primaryElement = getPrimaryElement(player);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("battle_attack_select")
      .setPlaceholder("Select an elemental attack...")
      .addOptions(
        attacks.map((attack) => {
          const attackElement =
            Object.entries(ELEMENTAL_ATTACKS).find(([element, attacks]) =>
              attacks.includes(attack)
            )?.[0] || "NEUTRAL";

          const isPrimary = attackElement === primaryElement;
          const sprite = ATTACK_SPRITES[attack] || "⚔️";
          const description = `${sprite} Power: ${ATTACK_POWER[attack] * 100}%${
            isPrimary ? " (+5% bonus)" : ""
          }`;

          return {
            label: `${sprite} ${attack}`,
            value: `${attack
              .toLowerCase()
              .replace(/\s+/g, "_")}:${attackElement}`,
            description: description,
          };
        })
      )
  );
};

/**
 * Create item selection menu
 */
const createItemMenu = async (userId) => {
  const inventory = await getUserInventory(userId);
  const usableItems = inventory.filter(
    (item) =>
      item.item_type.includes("POTION") || item.item_type.includes("BOOST")
  );

  // Ensure we have at least 1 option and no more than 25
  // Use a Set to track unique item types to avoid duplicates
  const uniqueItemTypes = new Set();
  let options = [];
  
  for (const item of usableItems) {
    if (options.length >= 25) break;
    
    const itemType = item.item_type;
    if (!uniqueItemTypes.has(itemType)) {
      uniqueItemTypes.add(itemType);
      options.push({
        label: itemType.replace(/_/g, " "),
        value: itemType,
        description: `Quantity: ${usableItems.filter(i => i.item_type === itemType).reduce((sum, i) => sum + i.quantity, 0)}`,
      });
    }
  }

  if (options.length === 0) {
    // If no usable items, show back button instead of disabled menu
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("battle_back")
        .setLabel("⬅️ Back")
        .setStyle(ButtonStyle.Secondary)
    );
  } else {
    // If items available, show the select menu
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("battle_item_select")
        .setPlaceholder("Select an item to use...")
        .addOptions(options)
    );
  }
};

/**
 * Process player attack for fused characters
 */
export const processFusedPlayerAttack = async (
  interaction,
  battleId,
  attackData
) => {
  const [attackName, attackElement] = attackData.split(":");
  const battleState = activeBattles.get(battleId);
  if (!battleState || battleState.turn !== "player") return;

  const { player, enemy } = battleState;

  // Calculate damage using fused combat engine with battle state for boosts
  const combatResult = await executeFusedCombatTurn(
    player,
    enemy,
    attackElement,
    battleState.battleType || "training",
    battleState
  );

  // Update enemy health
  enemy.currentHealth = combatResult.defenderHealth;

  // Add to battle log with sprite
  const attackSprite = ATTACK_SPRITES[attackName] || "⚔️";
  battleState.battleLog.push(
    `${attackSprite} **${player.username}** used ${attackName} (${attackElement})!`
  );

  if (combatResult.critical) {
    battleState.battleLog.push(
      `💥 **Critical Hit!** It dealt ${combatResult.damage} damage!`
    );
  } else {
    battleState.battleLog.push(`It dealt ${combatResult.damage} damage`);
  }

  // Show elemental effectiveness
  const elementMultiplier = getElementMultiplier(attackElement, enemy.element);
  if (elementMultiplier > 1) {
    battleState.battleLog.push("💥 Super Effective!");
  } else if (elementMultiplier < 1) {
    battleState.battleLog.push("⚡ Not Very Effective...");
  }

  // Check if enemy is defeated
  if (combatResult.isDefeated) {
    battleState.battleLog.push(`🎉 **${enemy.name} was defeated!**`);
    if (combatResult.xpGained > 0) {
      battleState.battleLog.push(`✨ You gained ${combatResult.xpGained} XP!`);
    }
    if (combatResult.tierUp) {
      battleState.battleLog.push(`🏅 **Tier Up!** Your champion has advanced to the next Tier!`);
    }
    if (combatResult.lootItem) {
      battleState.battleLog.push(
        `🎁 Found: ${combatResult.lootItem.replace(/_/g, " ")}`
      );
    }
    await endFusedBattle(interaction, battleId, "victory", combatResult);
    return;
  }

  battleState.turn = "enemy";
  battleState.phase = "action";

  // Update message
  const { embeds, components } = await createFusedBattleEmbed(
    battleState,
    battleId
  );
  try {
    await battleState.message.edit({ embeds, components });
  } catch (error) {
    if (error.code === 10008) {
      // Unknown Message error - create new ephemeral message
      console.log(
        "Message not found in processFusedPlayerAttack, creating new ephemeral message..."
      );
      const newMessage = await battleState.originalInteraction.followUp({
        embeds,
        components,
        ephemeral: true
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
  if (!battleState || battleState.turn !== "enemy") return;

  const { player, enemy } = battleState;

  // Simple enemy AI - just basic attack
  const enemyAttack = "Tackle";
  
  // Use percentage-based defense reduction like player attacks
  const baseDamage = enemy.attack * 0.8;
  const defenseReduction = Math.min(0.75, player.defense / (player.defense + 100));
  const finalDamage = Math.max(1, Math.floor(baseDamage * (1 - defenseReduction)));

  // Update player health
  player.currentHealth = Math.max(0, player.currentHealth - finalDamage);

  // Add to battle log
  battleState.battleLog.push(`**${enemy.name}** attacks with ${enemyAttack}!`);
  battleState.battleLog.push(`It deals ${finalDamage} damage to you!`);

  // Check if player is defeated
  if (player.currentHealth <= 0) {
    battleState.battleLog.push(`💀 **You were defeated!**`);
    await endFusedBattle(interaction, battleId, "defeat");
    return;
  }

  battleState.turn = "player";
  battleState.phase = "action";

  // Update message
  const { embeds, components } = await createFusedBattleEmbed(
    battleState,
    battleId
  );
  try {
    await battleState.message.edit({ embeds, components });
  } catch (error) {
    if (error.code === 10008) {
      // Unknown Message error - create new ephemeral message
      console.log(
        "Message not found in processEnemyTurn, creating new ephemeral message..."
      );
      const newMessage = await battleState.originalInteraction.followUp({
        embeds,
        components,
        ephemeral: true
      });
      battleState.message = newMessage;
    } else {
      throw error;
    }
  }
};

/**
 * End battle and cleanup for fused characters
 */
const endFusedBattle = async (
  interaction,
  battleId,
  result,
  combatResult = null
) => {
  const battleState = activeBattles.get(battleId);
  if (!battleState) return;

  try {
    // Remove components
    await battleState.message.edit({ components: [] });

    if (result === "victory" && combatResult) {
      const rewardsText = `⭐ ${combatResult.xpGained} XP${
        combatResult.lootItem
          ? `\n🎁 1 ${combatResult.lootItem.replace(/_/g, " ")}`
          : ""
      }`;

      // Training shows rewards
      if (battleState.battleType === "training") {
        const finalEmbed = new EmbedBuilder()
          .setTitle("🎉 Victory!")
          .setColor(0x00ff00)
          .setDescription(battleState.battleLog.join("\n"))
          .addFields({
            name: "Rewards",
            value: rewardsText,
            inline: true,
          });
        await battleState.message.edit({ embeds: [finalEmbed] });
      }

      // Callback on victory
      if (battleState.onBattleEnd) {
        try { await battleState.onBattleEnd({ result: 'victory', combatResult, battleState }); } catch (e) { console.error('onBattleEnd error:', e); }
      }

      // If this is a training battle and the player leveled up, send a congrats embed with new stats
      if (battleState.battleType === "training" && combatResult.levelUp) {
        try {
          const updated = await getFusedCharacter(battleState.player.user_id);
          if (updated) {
            const tier = updated.tier || 1;
            const lvl = updated.tier_level || updated.level || 1;
            const currentXp = updated.tier_xp ?? updated.xp ?? 0;
            const xpNeeded = getXpForNextLevel(lvl, tier);
            const progressBar = generateHealthBar(currentXp, xpNeeded); // reuse bar style visually

            const congrats = new EmbedBuilder()
              .setTitle("🏅 Level Up!")
              .setColor(0x00ff88)
              .setDescription(`Congratulations, ${battleState.player.username}!`)
              .addFields(
                {
                  name: "New Rank",
                  value: `Tier ${tier} • Level ${lvl}`,
                  inline: true,
                },
                {
                  name: "Updated Stats",
                  value: `🗡️ Attack: ${updated.total_attack}\n🛡️ Defense: ${updated.total_defense}\n❤️ Max HP: ${updated.max_hp}`,
                  inline: true,
                },
                {
                  name: "XP Progress",
                  value: `${currentXp}/${xpNeeded} XP\n${progressBar}`,
                  inline: false,
                }
              );

            // Send as ephemeral follow-up in training sessions
            await battleState.originalInteraction.followUp({ embeds: [congrats], ephemeral: true });
          }
        } catch (e) {
          console.error("Failed to send level-up congrats embed:", e);
        }
      }
    } else if (result === "defeat") {
      if (battleState.battleType === "training") {
        const finalEmbed = new EmbedBuilder()
          .setTitle("💀 Defeat")
          .setColor(0xff0000)
          .setDescription(battleState.battleLog.join("\n"));
        await battleState.message.edit({ embeds: [finalEmbed] });
      }
      if (battleState.onBattleEnd) {
        try { await battleState.onBattleEnd({ result: 'defeat', battleState }); } catch (e) { console.error('onBattleEnd error:', e); }
      }
    } else if (result === "fled") {
      const finalEmbed = new EmbedBuilder()
        .setTitle("🏃 Flee")
        .setColor(0xffff00)
        .setDescription(battleState.battleLog.join("\n"));

      await battleState.message.edit({ embeds: [finalEmbed] });
      if (battleState.onBattleEnd) {
        try { await battleState.onBattleEnd({ result: 'fled', battleState }); } catch (e) { console.error('onBattleEnd error:', e); }
      }
    }
    } catch (error) {
    if (error.code === 10008) {
      // Unknown Message error - create new ephemeral message
      console.log(
        "Message not found in endFusedBattle, creating new ephemeral message..."
      );
      const finalEmbed = new EmbedBuilder()
        .setTitle(
          result === "victory"
            ? "🎉 Victory!"
            : result === "defeat"
            ? "💀 Defeat"
            : "🏃 Flee"
        )
        .setColor(
          result === "victory"
            ? 0x00ff00
            : result === "defeat"
            ? 0xff0000
            : 0xffff00
        )
        .setDescription(battleState.battleLog.join("\n"));

      if (result === "victory" && combatResult) {
        finalEmbed.addFields({
          name: "Rewards",
          value: `⭐ ${combatResult.xpGained} XP${
            combatResult.lootItem
              ? `\n🎁 1 ${combatResult.lootItem.replace(/_/g, " ")}`
              : ""
          }`,
          inline: true,
        });
      }

      // Keep training ephemeral if needed
      if (battleState.battleType === "training" && battleState.isEphemeral) {
        await battleState.originalInteraction.followUp({ embeds: [finalEmbed], ephemeral: true });
      } else {
        try {
          await battleState.originalInteraction.followUp({ embeds: [finalEmbed], ephemeral: true });
        } catch (_) {
          if (battleState.originalInteraction.channel && battleState.originalInteraction.channel.send) {
            await battleState.originalInteraction.channel.send({ embeds: [finalEmbed] }); // likely DM
          }
        }
      }
    } else {
      console.error("Error in endFusedBattle:", error);
      // Try to send a simple message if all else fails
      if (battleState.battleType === "training" && battleState.isEphemeral) {
        await battleState.originalInteraction.followUp({ 
          content: result === "victory"
            ? "🎉 Victory! Check your rewards."
            : result === "defeat"
            ? "💀 You were defeated!"
            : "🏃 You fled from battle!",
          ephemeral: true 
        });
      } else {
        await interaction.channel.send(
          result === "victory"
            ? "🎉 Victory! Check your rewards."
            : result === "defeat"
            ? "💀 You were defeated!"
            : "🏃 You fled from battle!"
        );
      }
    }
  }

  activeBattles.delete(battleId);
  
  // If victory and training mode, automatically start a new battle
  if (result === "victory" && battleState.battleType === "training") {
    // Update session stats with rewards from this battle
    if (combatResult) {
      battleState.totalXPGained += combatResult.xpGained || 0;
      if (combatResult.lootItem) {
        battleState.totalLoot.push(combatResult.lootItem);
      }
    }
    
    // Add a small delay before starting the next battle
    setTimeout(() => {
      startNextTrainingBattle(interaction, battleState.player, battleState);
    }, 2000);
  } else if (result === "defeat" && battleState.battleType === "training") {
    // Show session summary on defeat in training mode
    await showTrainingSessionSummary(interaction, battleState);
  }
};

/**
 * Handle battle interactions for fused characters
 */
export const handleFusedBattleInteraction = async (interaction) => {
  console.log(
    "Fused battle interaction received:",
    interaction.customId,
    interaction.type
  );

  if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
    console.log("Interaction is not a button or select menu");
    return;
  }

  // Find battle ID by user ID - battle IDs are in format "userId-timestamp"
  const battleId = Array.from(activeBattles.keys()).find((id) => {
    const [userId] = id.split("-");
    return userId === interaction.user.id;
  });
  if (!battleId) {
    console.log("No active battle found for user:", interaction.user.id);
    return;
  }

  const battleState = activeBattles.get(battleId);
  if (!battleState) {
    console.log("Battle state not found for battle ID:", battleId);
    return;
  }

  console.log("Found battle state:", battleState.phase, battleState.turn);

  try {
    // Check if interaction is already responded to or expired
    if (interaction.replied || interaction.deferred) {
      console.log("Interaction already handled, skipping");
      return;
    }

    try {
      await interaction.deferUpdate();
      console.log("Interaction deferred successfully");
    } catch (error) {
      if (error.code === 10062) {
        // Unknown interaction error - interaction has expired
        console.log("Interaction expired, cannot defer update");
        return;
      }
      throw error;
    }

    if (interaction.isButton()) {
      console.log("Button interaction:", interaction.customId);
      switch (interaction.customId) {
        case "battle_attack":
          battleState.phase = "attack_select";
          console.log("Changed phase to attack_select");
          break;
        case "battle_items":
          battleState.phase = "item_select";
          console.log("Changed phase to item_select");
          break;
        case "battle_flee":
          battleState.battleLog.push("🏃 You fled from battle!");
          console.log("Fleeing from battle");
          await endFusedBattle(interaction, battleId, "fled");
          return;
      }
    } else if (interaction.isStringSelectMenu()) {
      console.log("Select menu interaction:", interaction.customId);
      if (interaction.customId === "battle_attack_select") {
        console.log("Processing attack selection:", interaction.values[0]);
        await processFusedPlayerAttack(
          interaction,
          battleId,
          interaction.values[0]
        );
        return;
      } else if (interaction.customId === "battle_item_select") {
        console.log("Processing item selection:", interaction.values[0]);
        await processItemUse(interaction, battleId, interaction.values[0]);
        return;
      }
    }

    // Handle back button
    if (interaction.customId === "battle_back") {
      console.log("Back button pressed, returning to action phase");
      battleState.phase = "action";
    }

    // Update message with new state
    console.log("Updating battle message with new state");
    const { embeds, components } = await createFusedBattleEmbed(
      battleState,
      battleId
    );

    try {
      await battleState.message.edit({ embeds, components });
      console.log("Battle message updated successfully");
    } catch (error) {
      if (error.code === 10008) {
        // Unknown Message error - create new ephemeral message
        console.log("Message not found, creating new ephemeral message...");
        // Create a new ephemeral message and update the battle state reference
        const newMessage = await battleState.originalInteraction.followUp({
          embeds,
          components,
          ephemeral: true
        });
        battleState.message = newMessage;
        console.log("New ephemeral battle message created");
      } else {
        throw error; // Re-throw other errors
      }
    }
  } catch (error) {
    console.error("Error handling fused battle interaction:", error);
    // Try to reply with error if deferUpdate failed
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred processing your action.",
        ephemeral: true,
      });
    }
  }
};

/**
 * Process item use during battle
 */
const processItemUse = async (interaction, battleId, itemType) => {
  const battleState = activeBattles.get(battleId);
  if (!battleState || battleState.turn !== "player") return;

  const { player } = battleState;
  
  // Get the actual item from inventory
  const item = await getUserItemByType(player.user_id, itemType);
  if (!item) {
    battleState.battleLog.push(
      `❌ You don't have any **${itemType.replace(/_/g, " ")}**!`
    );
    battleState.phase = "action";
    await updateBattleMessage(interaction, battleState, battleId);
    return;
  }

  // Decrement item quantity
  const updatedItem = await decrementItemQuantity(item.item_id, player.user_id);
  if (!updatedItem) {
    battleState.battleLog.push(
      `❌ Failed to use **${itemType.replace(/_/g, " ")}**!`
    );
    battleState.phase = "action";
    await updateBattleMessage(interaction, battleState, battleId);
    return;
  }

  // Handle different item types with actual effects
  switch (itemType) {
    case "HEALTH_POTION":
      const healAmount = 50;
      player.currentHealth = Math.min(
        player.maxHealth,
        player.currentHealth + healAmount
      );
      battleState.battleLog.push(
        `💖 Used **Health Potion** and recovered ${healAmount} HP! (${updatedItem.quantity - 1} left)`
      );
      break;

    case "ATTACK_BOOST_1H":
      // Add attack boost to battle state
      if (!battleState.activeBoosts) battleState.activeBoosts = {};
      battleState.activeBoosts.attack = {
        multiplier: 1.5,
        duration: 5, // lasts for 5 turns
        remaining: 5
      };
      battleState.battleLog.push(
        `⚡ Used **Attack Boost**! Attack increased by 50% for 5 turns! (${updatedItem.quantity - 1} left)`
      );
      break;

    case "DEFENSE_BOOST_1H":
      // Add defense boost to battle state
      if (!battleState.activeBoosts) battleState.activeBoosts = {};
      battleState.activeBoosts.defense = {
        multiplier: 1.5,
        duration: 5, // lasts for 5 turns
        remaining: 5
      };
      battleState.battleLog.push(
        `🛡️ Used **Defense Boost**! Defense increased by 50% for 5 turns! (${updatedItem.quantity - 1} left)`
      );
      break;

    case "XP_BOOST_1H":
      // Add XP boost to battle state
      if (!battleState.activeBoosts) battleState.activeBoosts = {};
      battleState.activeBoosts.xp = {
        multiplier: 2.0,
        duration: 3, // lasts for 3 battles
        remaining: 3
      };
      battleState.battleLog.push(
        `🌟 Used **XP Boost**! XP gain doubled for 3 battles! (${updatedItem.quantity - 1} left)`
      );
      break;

    default:
      battleState.battleLog.push(
        `❌ Used **${itemType.replace(/_/g, " ")}** but it had no effect! (${updatedItem.quantity - 1} left)`
      );
      break;
  }

  battleState.turn = "enemy";
  battleState.phase = "action";

  // Update message
  await updateBattleMessage(interaction, battleState, battleId);

  // Process enemy turn after a delay
  setTimeout(() => processEnemyTurn(interaction, battleId), 1500);
};

/**
 * Update battle message with current state
 */
const updateBattleMessage = async (interaction, battleState, battleId) => {
  const { embeds, components } = await createFusedBattleEmbed(
    battleState,
    battleId
  );
  try {
    await battleState.message.edit({ embeds, components });
  } catch (error) {
    if (error.code === 10008) {
      // Unknown Message error - create new ephemeral message
      console.log(
        "Message not found in updateBattleMessage, creating new ephemeral message..."
      );
      const newMessage = await battleState.originalInteraction.followUp({
        embeds,
        components,
        ephemeral: true
      });
      battleState.message = newMessage;
    } else {
      throw error;
    }
  }
};

/**
 * Start the next training battle automatically
 */
const startNextTrainingBattle = async (interaction, playerData, previousBattleState) => {
  try {
    // Refresh fused character from DB to reflect recent level-ups
    const { getFusedCharacter } = await import('../data/fusedCharacters.js');
    const refreshed = await getFusedCharacter(interaction.user.id);

    const currentTier = refreshed?.tier || playerData.tier || 1;
    const currentLevel = refreshed?.tier_level || refreshed?.level || playerData.level || 1;

    // Generate new enemy based on player's current tier level and tier
    const enemy = generateTrainingEnemy(currentLevel, currentTier);
    
    // Create new battle state with cumulative session data
    const battleId = `${interaction.user.id}-${Date.now()}`;
    
    const battleState = {
      player: {
        ...playerData,
        level: currentLevel,
        tier: currentTier,
        tier_level: currentLevel,
        total_attack: refreshed?.total_attack ?? playerData.total_attack,
        defense: refreshed?.total_defense ?? playerData.defense ?? playerData.total_defense ?? 50,
        maxHealth: refreshed?.max_hp ?? playerData.max_hp,
        currentHealth: Math.min(refreshed?.current_hp ?? playerData.currentHealth ?? playerData.max_hp, refreshed?.max_hp ?? playerData.max_hp),
      },
      enemy: {
        ...enemy,
        currentHealth: enemy.health,
        maxHealth: enemy.health,
      },
      turn: "player",
      phase: "action",
      battleLog: [`🌀 **Another enemy approaches!** A wild ${enemy.name} appears!`],
      sessionLog: [...(previousBattleState?.sessionLog || []), `🌀 A wild ${enemy.name} appears!`],
      message: null,
      battleType: "training",
      battlesWon: (previousBattleState?.battlesWon || 0) + 1,
      totalXPGained: previousBattleState?.totalXPGained || 0,
      totalLoot: previousBattleState?.totalLoot || [],
      isEphemeral: true,
      originalInteraction: interaction, // Add originalInteraction reference
    };

    activeBattles.set(battleId, battleState);

    // Create battle embeds and components
    const { embeds, components } = await createFusedBattleEmbed(battleState, battleId);
    
    // Send new ephemeral battle message for training
    const message = await battleState.originalInteraction.followUp({
      embeds,
      components,
      ephemeral: true
    });

    battleState.message = message;
    activeBattles.set(battleId, battleState);
    return;
  
  } catch (error) {
    console.error("Error starting next training battle:", error);
    // If auto-battle fails, show session summary
    await showTrainingSessionSummary(interaction, previousBattleState);
  }
};

export default {
  startFusedBattle,
  handleFusedBattleInteraction,
  processFusedPlayerAttack,
};
