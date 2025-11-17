import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createChallenge, expirePendingChallenges } from '../data/pvpSessions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pvp')
    .setDescription('Player vs Player kill race')
    .addSubcommand(sc => sc
      .setName('challenge')
      .setDescription('Challenge another player to a timed kill race with MKIN stakes')
      .addUserOption(opt => opt.setName('opponent').setDescription('User to challenge').setRequired(true))
      .addIntegerOption(opt => opt.setName('stake').setDescription('MKIN stake (winner takes double)').setMinValue(1).setRequired(true))
      .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes (5-60)').setMinValue(5).setMaxValue(60).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'challenge') return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });

    await expirePendingChallenges().catch(() => {});

    const opponent = interaction.options.getUser('opponent');
    const stake = interaction.options.getInteger('stake');
    const duration = interaction.options.getInteger('duration');

    if (opponent.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot challenge yourself.', ephemeral: true });
    }

    // Create challenge row
    let challenge;
    try {
      challenge = await createChallenge(interaction.user.id, opponent.id, stake, duration);
    } catch (e) {
      console.error('createChallenge failed:', e);
      return interaction.reply({ content: '❌ Failed to create challenge. Please try again.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ PvP Kill Race Challenge')
      .setDescription(`**${interaction.user.displayName || interaction.user.username}** challenged **${opponent.displayName || opponent.username}** to a kill race!`)
      .addFields(
        { name: '💰 Stake', value: `${stake} MKIN each`, inline: true },
        { name: '⏱️ Duration', value: `${duration} minutes`, inline: true },
        { name: '🏆 Prize Pool', value: `${stake * 2} MKIN`, inline: true },
      )
      .setFooter({ text: 'Challenge expires in 5 minutes • Accept to begin' })
      .setColor(0x00D4AA);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pvp_accept_${challenge.challenge_id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`pvp_decline_${challenge.challenge_id}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger)
    );

    // Send DMs to both users for privacy
    let dmErrors = [];
    try {
      await interaction.user.send({ embeds: [embed], components: [row] });
    } catch (e) {
      dmErrors.push('challenger');
      console.warn('Failed to DM challenger:', e?.message || e);
    }
    try {
      await opponent.send({ embeds: [embed], components: [row] });
    } catch (e) {
      dmErrors.push('opponent');
      console.warn('Failed to DM opponent:', e?.message || e);
    }

    // Ephemeral confirmation in-channel
    if (dmErrors.length === 0) {
      await interaction.reply({ content: '✅ Challenge sent privately to both players (via DM).', ephemeral: true });
    } else if (dmErrors.length === 1) {
      const who = dmErrors[0] === 'challenger' ? 'you' : 'the opponent';
      await interaction.reply({ content: `⚠️ Challenge created, but I could not DM ${who}. Please ensure DMs are enabled.`, ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Challenge created, but I could not DM either user. Enable DMs or try again.', ephemeral: true });
    }
  }
};
