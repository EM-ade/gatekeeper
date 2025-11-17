import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('website')
    .setDescription('Get quick links to the Realmkin website and dashboard'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🌐 Realmkin Website & Dashboard')
      .setDescription('Access your Realmkin dashboard and manage your account')
      .addFields(
        { 
          name: '💰 Dashboard', 
          value: '[Visit Dashboard](https://realmkin.com)\nClaim rewards, check balance, manage wallet', 
          inline: true 
        },
        { 
          name: '⚔️ Quick Actions', 
          value: '• Use `/balance` to check MKIN\n• Use `/train` to start earning\n• Join void battles to compete', 
          inline: true 
        },
        { 
          name: '🔗 Account Status', 
          value: interaction.user.id ? '✅ Discord Linked' : '❌ Not Linked', 
          inline: true 
        }
      )
      .setColor(0xDA9C2F)
      .setThumbnail('https://realmkin.com/realmkin-logo.png')
      .setFooter({ text: 'Realmkin • Seamless Web3 Gaming' });

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('🌐 Open Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL('https://realmkin.com'),
        new ButtonBuilder()
          .setLabel('📊 View Leaderboard')
          .setStyle(ButtonStyle.Link)
          .setURL('https://realmkin.com/leaderboard')
      );

    await interaction.reply({ 
      embeds: [embed], 
      components: [buttons], 
      ephemeral: true 
    });
  }
};
