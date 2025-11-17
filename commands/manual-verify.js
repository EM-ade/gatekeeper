import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import sql from '../db.js';
import PeriodicVerificationService from '../services/periodicVerification.js';

export default {
  data: new SlashCommandBuilder()
    .setName('manual-verify')
    .setDescription('Manually trigger NFT verification for users')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('all')
        .setDescription('Verify all stored users in this guild')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription('Verify a specific user')
        .addUserOption((option) =>
          option
            .setName('target')
            .setDescription('The user to verify')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'all') {
      return handleVerifyAll(interaction);
    } else if (subcommand === 'user') {
      return handleVerifyUser(interaction);
    }
  },
};

async function handleVerifyAll(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId;

    // Get all users in this guild with wallet addresses
    const users = await sql`
      SELECT discord_id, guild_id, wallet_address, username, is_verified
      FROM users
      WHERE guild_id = ${guildId} AND wallet_address IS NOT NULL
      ORDER BY last_verification_check ASC NULLS FIRST
    `;

    if (users.length === 0) {
      return interaction.editReply({
        content: '❌ No users with wallet addresses found in this guild.',
      });
    }

    await interaction.editReply({
      content: `⏳ Starting verification for ${users.length} users...`,
    });

    // Use the periodic verification service if available
    if (global.periodicVerificationService) {
      let verified = 0;
      let failed = 0;

      for (const user of users) {
        try {
          console.log(`[manual-verify] Verifying user ${user.discord_id}...`);
          await global.periodicVerificationService.checkAndUpdateUser(user);
          verified++;

          // Add small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[manual-verify] Error verifying user ${user.discord_id}:`, error.message);
          failed++;
        }
      }

      await interaction.editReply({
        content: `✅ Verification complete!\n\n` +
          `**Verified:** ${verified} users\n` +
          `**Failed:** ${failed} users\n` +
          `**Total:** ${users.length} users`,
      });
    } else {
      await interaction.editReply({
        content: '❌ Periodic verification service is not initialized.',
      });
    }
  } catch (error) {
    console.error('[manual-verify] Error:', error);
    await interaction.editReply({
      content: `❌ Error during verification: ${error.message}`,
    });
  }
}

async function handleVerifyUser(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const targetUser = interaction.options.getUser('target');
    const guildId = interaction.guildId;

    // Get user from database
    const users = await sql`
      SELECT discord_id, guild_id, wallet_address, username, is_verified
      FROM users
      WHERE discord_id = ${targetUser.id} AND guild_id = ${guildId}
    `;

    if (users.length === 0) {
      return interaction.editReply({
        content: `❌ User <@${targetUser.id}> has no verification record in this guild.`,
      });
    }

    const user = users[0];

    if (!user.wallet_address) {
      return interaction.editReply({
        content: `❌ User <@${targetUser.id}> has no wallet address linked.`,
      });
    }

    await interaction.editReply({
      content: `⏳ Verifying <@${targetUser.id}>...`,
    });

    if (global.periodicVerificationService) {
      try {
        console.log(`[manual-verify] Verifying user ${user.discord_id}...`);
        await global.periodicVerificationService.checkAndUpdateUser(user);

        await interaction.editReply({
          content: `✅ Verification complete for <@${targetUser.id}>!\n\n` +
            `**Wallet:** \`${user.wallet_address}\`\n` +
            `**Status:** Updated`,
        });
      } catch (error) {
        console.error(`[manual-verify] Error verifying user:`, error.message);
        await interaction.editReply({
          content: `❌ Error verifying user: ${error.message}`,
        });
      }
    } else {
      await interaction.editReply({
        content: '❌ Periodic verification service is not initialized.',
      });
    }
  } catch (error) {
    console.error('[manual-verify] Error:', error);
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
    });
  }
}
