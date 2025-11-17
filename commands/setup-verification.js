import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType, AttachmentBuilder } from 'discord.js';
import * as botConfigsRepository from '../repositories/botConfigsRepository.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Set up a permanent NFT verification message in a channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel where the verification message should be posted')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  async execute(interaction) {
  try {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({
        content: '❌ You need administrator permissions to set up verification.',
        ephemeral: true
      });
    }

    const channel = interaction.options.getChannel('channel');
    
    // Defer the reply since this might take some time
    await interaction.deferReply({ ephemeral: true });

    // Static role descriptions (same as /verify-nft)
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

    // Create verification embed (same as /verify-nft)
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

    // Send the verification message to the channel
    const verificationMessage = await channel.send({
      embeds: [embed],
      components: [buttonRow],
      files: [attachment]
    });

    // Update bot configuration in Supabase
    await botConfigsRepository.upsertConfig({
      guildId: interaction.guild.id,
      guildName: interaction.guild.name,
      verificationChannelId: channel.id,
      verificationMessageId: verificationMessage.id,
    });

    await interaction.editReply({
      content: `✅ Verification system has been set up in ${channel}! Users can now verify their NFTs by clicking the button.`
    });

    console.log(`Verification system set up in guild ${interaction.guild.name} (${interaction.guild.id}) in channel ${channel.name}`);

  } catch (error) {
    console.error('Error setting up verification:', error);
    try {
      await interaction.editReply({
        content: '❌ An error occurred while setting up the verification system. Please try again later.'
      });
    } catch (editError) {
      console.error('Failed to edit reply:', editError);
      try {
        await interaction.followUp({
          content: '❌ An error occurred while setting up the verification system. Please try again later.',
          ephemeral: true
        });
      } catch (followUpError) {
        console.error('Failed to send follow-up message:', followUpError);
      }
    }
  }
  }
};
