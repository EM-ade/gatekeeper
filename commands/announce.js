import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Creates and sends an announcement to a specific channel.')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The title of the announcement.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The main content of the announcement.')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send the announcement to.')
                .setRequired(true)
                .addChannelTypes(0)) // 0 = GuildText
        .setDefaultMemberPermissions(0x8), // Administrator
    async execute(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const channel = interaction.options.getChannel('channel');

        const announcementEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor('#5865F2')
            .setTimestamp();

        try {
            await channel.send({ embeds: [announcementEmbed] });
            await interaction.reply({
                content: `✅ Announcement successfully posted in ${channel.name}.`,
                ephemeral: true
            });
        } catch (error) {
            console.error(`Could not send announcement to ${channel.name}:`, error);
            await interaction.reply({
                content: 'There was an error trying to send the announcement to that channel.',
                ephemeral: true
            });
        }
    },
};
