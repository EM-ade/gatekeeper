import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to use the Realmkin bot and link your account')
    ,
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🧭 Realmkin Bot Help')
      .setColor(0xDA9C2F)
      .setThumbnail('https://therealmkin.xyz/realmkin-logo.png')
      .setDescription('Welcome to Realmkin! Follow these steps to link your account and start playing.')
      .addFields(
        {
          name: '🔗 Link Your Discord (Required)',
          value: 'Go to our website and connect your Discord account so your $MKIN balance is unified across the site and bot.\n\n➡️ **Link here:** https://therealmkin.xyz\n\nWithout linking, any $MKIN earned in Discord will not be credited to your universal balance.'
        },
        {
          name: '⚔️ Getting Started',
          value: '• Use `/train` to battle and earn $MKIN in the VOID\n• Use `/void-balance` to check your VOID balance\n• Join community events with `/void ...` commands'
        },
        {
          name: '🏆 PvP (Kill Race)',
          value: 'Challenge another player with `/pvp challenge @user <stake> <duration>`\nWinner is the one with the most kills before the timer ends. Stakes use your unified balance.'
        },
        {
          name: '📜 Notes',
          value: '• Ensure your DMs are open to receive private challenges\n• If you see duplicate commands, wait a moment or try again after the bot restarts'
        },
        {
          name: '🌐 Website',
          value: 'Dashboard, rewards and account management: https://therealmkin.xyz'
        }
      )
      .setFooter({ text: 'Realmkin • Adventure awaits beyond the Gate' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
