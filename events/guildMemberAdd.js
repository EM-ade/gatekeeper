
import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getSetting } from '../data/botSettings.js'; // Import the getSetting function

export default {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Get the configured welcome channel ID from the database
        const welcomeChannelId = await getSetting('welcome_channel_id');
        let welcomeChannel;

        if (welcomeChannelId) {
            welcomeChannel = member.guild.channels.cache.get(welcomeChannelId);
        } else {
            console.warn('Welcome channel ID not set in bot_settings. No welcome message will be sent.');
            return; // Exit if no channel is configured
        }

        if (!welcomeChannel) {
            console.warn(`Configured welcome channel with ID ${welcomeChannelId} not found in guild cache. It might have been deleted or permissions are an issue.`);
            return; // Exit if the channel object couldn't be retrieved
        }

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`Welcome to the Realm, ${member.user.username}!`)
            .setDescription('To gain access to the rest of the server, please verify your humanity. Click the button below to receive your role.')
            .setColor('#5865F2');

        const verifyButton = new ButtonBuilder()
            .setCustomId('verify_button')
            .setLabel('✅ Verify')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(verifyButton);

        try {
            await welcomeChannel.send({
                content: `Welcome ${member}!`,
                embeds: [welcomeEmbed],
                components: [row]
            });
        } catch (error) {
            console.error(`Could not send welcome message to ${member.user.tag} in channel ${welcomeChannel.name}:`, error);
        }
    },
};
