import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('void')
    .setDescription('Commands for the VOID PvE game.')
    .addSubcommandGroup(group =>
      group
        .setName('dashboard')
        .setDescription('Manage the live VOID dashboard')
        .addSubcommand(sub =>
          sub
            .setName('status')
            .setDescription('Show current dashboard status and event stats')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Starts a new 5-day VOID battle with fixed 7 MKIN reward per kill.'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('join')
        .setDescription('Join the current VOID battle.'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('balance')
        .setDescription('Checks your total Realmkin NFT balance.'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('Displays the top 10 players by $MKIN gained and kills.'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancels the current VOID battle (Admin only).')),
  async execute(interaction) {
    // This execute function for the parent command is primarily for Discord.js registration.
    // Subcommand logic is handled in events/interactionCreate.js.
    // You can reply here if you want a generic response when just /void is typed without a subcommand.
    // Or defer reply if you intend to send a follow-up specific to subcommand logic.
    await interaction.reply({ content: 'Please use `/void start` to begin a 5-day battle, `/void join` to enter, `/void balance` to check your Realmkin balance, `/void leaderboard` to see the top players, or `/void cancel` to cancel the battle (Admin only).', ephemeral: true });
  },
};
