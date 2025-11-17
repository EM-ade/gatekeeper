import { SlashCommandBuilder } from "discord.js";
import { getUserData } from "../data/userWallets.js";
import { getFusedCharacter } from "../data/fusedCharacters.js";
import { CooldownManager, formatCooldown } from "../game/gameUtils.js";
import { generateTrainingEnemy } from "../game/fusedCombatEngine.js";
import { startFusedBattle } from "../game/fusedBattleSystem.js";

// Cooldown manager for training command (30 seconds cooldown)
const cooldownManager = new CooldownManager(30000);

export default {
  data: new SlashCommandBuilder()
    .setName("train")
    .setDescription("Train your fused character in single-player combat"),

  async execute(interaction) {
    // Check cooldown
    if (cooldownManager.isOnCooldown(interaction.user.id)) {
      const remaining = cooldownManager.getRemainingCooldown(
        interaction.user.id
      );
      return interaction.reply({
        content: `⏰ Please wait ${formatCooldown(
          remaining
        )} before training again.`,
        ephemeral: true,
      });
    }

    // Set cooldown
    cooldownManager.setCooldown(interaction.user.id);

    // Defer reply since this might take some time
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get user data
      const userData = await getUserData(interaction.user.id);
      if (!userData || !userData.wallet_address) {
        return interaction.editReply({
          content: "❌ You need to verify your wallet first with `/check-nft`.",
          ephemeral: true,
        });
      }

      // Get fused character
      const fusedCharacter = await getFusedCharacter(interaction.user.id);
      if (!fusedCharacter) {
        return interaction.editReply({
          content:
            "❌ You need to verify your NFTs using `/check-nft` first to create your fused character.",
          ephemeral: true,
        });
      }

      // Generate enemy based on fused character tier level and tier
      const enemy = generateTrainingEnemy(fusedCharacter.tier_level || fusedCharacter.level, fusedCharacter.tier || 1);

      // Prepare player data for battle
      const playerData = {
        user_id: interaction.user.id,
        username: fusedCharacter.username || "Fused Hero",
        level: fusedCharacter.tier_level || fusedCharacter.level || 1,
        tier: fusedCharacter.tier || 1,
        tier_level: fusedCharacter.tier_level || fusedCharacter.level || 1,
        total_attack: fusedCharacter.total_attack || 50,
        defense: fusedCharacter.total_defense || 50,
        current_hp: fusedCharacter.current_hp || fusedCharacter.max_hp || 100,
        max_hp: fusedCharacter.max_hp || 100,
        // For elemental attacks, use the dominant element from affinities
        element: getDominantElement(fusedCharacter.elemental_affinities),
        // Include elemental affinities for multi-element attack selection
        elemental_affinities: fusedCharacter.elemental_affinities || {},
        rarity: "FUSED", // Special rarity for fused characters
        archetype: fusedCharacter.archetype || "ADVENTURER",
      };

      // Start fused battle
      await startFusedBattle(interaction, playerData, enemy);
    } catch (error) {
      console.error("Error in train command:", error);
      await interaction.editReply({
        content:
          "❌ An error occurred while starting training. Please try again.",
        ephemeral: true,
      });
    }
  },
};

// Helper function to get dominant element from affinities
const getDominantElement = (affinities) => {
  if (!affinities) return "NEUTRAL";

  let dominantElement = "NEUTRAL";
  let highestAffinity = 0;

  for (const [element, affinity] of Object.entries(affinities)) {
    if (affinity > highestAffinity) {
      highestAffinity = affinity;
      dominantElement = element;
    }
  }

  return dominantElement;
};
