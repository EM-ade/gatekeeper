import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName('verify-nft')
    .setDescription('Start the NFT verification process'),

  async execute(interaction) {
    // Defer immediately to prevent timeout
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (deferError) {
      console.error('Failed to defer interaction:', deferError);
      // If we can't defer, try to reply directly
      try {
        await interaction.reply({
          content: '❌ Interaction expired. Please try the command again.',
          ephemeral: true,
        });
      } catch (replyError) {
        console.error('Failed to reply to interaction:', replyError);
      }
      return;
    }

    try {
      // Static role descriptions
      const rolesDescription = 
        '• REALM King 👑\n' +
        '• REALM Queen 👑\n' +
        '• Priest\n' +
        '• Wizard\n' +
        '• Witch\n' +
        '• Jester\n' +
        '• Chief\n' +
        '• Warrior\n' +
        '• Butler\n' +
        '• Noble\'s\n' +
        '• RMK Royal (5+)\n' +
        '• RMK Royal (3+)\n' +
        '• RMK Royal (1+)';

      // Attach realmkin image
      const realmkinPath = path.join(__dirname, '..', 'public', 'realmkin.png');
      const attachment = new AttachmentBuilder(realmkinPath, { name: 'realmkin.png' });

      // Create verification embed
      const embed = new EmbedBuilder()
        .setColor('#DA9C2F')
        .setTitle('NFT Holdings Verification')
        .setDescription(
          'Click **"Verify Wallet"** below to connect your Solana wallet and claim your roles!'
        )
        .addFields(
          {
            name: '🎭 Realmkin Roles:',
            value: rolesDescription,
            inline: false
          }
        )
        .setThumbnail('attachment://realmkin.png')
        .setFooter({ text: 'Last updated: Never' })
        .setTimestamp();

      // Create verify button
      const verifyButton = new ButtonBuilder()
        .setCustomId('nft_verify_button')
        .setLabel('Verify Wallet')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✅');

      const buttonRow = new ActionRowBuilder().addComponents(verifyButton);

      // Edit the deferred reply with the embed and button
      await interaction.editReply({
        embeds: [embed],
        components: [buttonRow],
        files: [attachment]
      });

    } catch (error) {
      console.error('Error in verify-nft command:', error);
      try {
        await interaction.editReply({
          content: '❌ An error occurred while starting the verification process. Please try again later.',
        });
      } catch (editError) {
        console.error('Failed to edit reply with error message:', editError);
      }
    }
  },
};
