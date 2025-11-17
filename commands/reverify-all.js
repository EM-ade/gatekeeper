import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import admin from 'firebase-admin';
import { verificationSessionService } from '../services/verificationSessionService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('reverify-all')
    .setDescription('🔄 Manually reverify all users in the guild (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(option =>
      option
        .setName('dry-run')
        .setDescription('Test run without actually reverifying (default: false)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Check if user is admin
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You need Administrator permissions to use this command.',
        ephemeral: true,
      });
    }

    const isDryRun = interaction.options.getBoolean('dry-run') ?? false;
    const guildId = interaction.guildId;

    await interaction.deferReply({ ephemeral: true });

    try {
      console.log(`\n🔄 Starting reverify-all command (Dry Run: ${isDryRun})`);
      console.log(`Guild ID: ${guildId}`);

      const db = admin.firestore();
      let processedCount = 0;
      let successCount = 0;
      let failedCount = 0;
      const failedUsers = [];

      // Get all verification sessions for this guild
      const sessionsSnapshot = await db
        .collection('verificationSessions')
        .where('guildId', '==', guildId)
        .get();

      console.log(`Found ${sessionsSnapshot.size} verification sessions\n`);

      if (sessionsSnapshot.size === 0) {
        return interaction.editReply({
          content: '⚠️ No verification sessions found for this guild.',
        });
      }

      // Process each session
      for (const sessionDoc of sessionsSnapshot.docs) {
        const session = sessionDoc.data();
        processedCount++;

        try {
          console.log(`\n[${processedCount}] Processing user: ${session.discordId}`);
          console.log(`   Wallet: ${session.walletAddress}`);
          console.log(`   Username: ${session.username || 'N/A'}`);

          if (isDryRun) {
            console.log(`   ✅ [DRY RUN] Would reverify this user`);
            successCount++;
            continue;
          }

          // Reverify the session
          const result = await verificationSessionService.verifySession(
            sessionDoc.id,
            'manual-reverify-all',
            {
              walletAddress: session.walletAddress,
              username: session.username,
              client: interaction.client,
            }
          );

          if (result.verification) {
            console.log(`   ✅ Reverification successful`);
            console.log(`   NFTs Found: ${result.verification.nftCount || 0}`);
            console.log(`   Verified: ${result.verification.isVerified}`);
            successCount++;
          } else {
            console.log(`   ⚠️ Reverification completed but no verification result`);
            successCount++;
          }
        } catch (error) {
          console.error(`   ❌ Error reverifying user: ${error.message}`);
          failedCount++;
          failedUsers.push({
            discordId: session.discordId,
            wallet: session.walletAddress,
            error: error.message,
          });
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Send summary
      const summary = `
🔄 **Reverify All Complete** ${isDryRun ? '(DRY RUN)' : ''}

📊 **Summary:**
✅ Successful: ${successCount}
❌ Failed: ${failedCount}
📈 Total Processed: ${processedCount}

${isDryRun ? '💡 This was a dry run. Run again without the dry-run option to actually reverify users.' : ''}

${failedCount > 0 ? `\n⚠️ **Failed Users:**\n${failedUsers.map(u => `• <@${u.discordId}> - ${u.error}`).join('\n')}` : ''}
      `.trim();

      await interaction.editReply({
        content: summary,
      });

      console.log(`\n✅ Reverify-all command completed`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Failed: ${failedCount}`);

    } catch (error) {
      console.error('❌ Reverify-all command error:', error);
      await interaction.editReply({
        content: `❌ Error during reverification: ${error.message}`,
      });
    }
  },
};
