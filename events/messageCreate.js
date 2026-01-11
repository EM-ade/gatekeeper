import { Events } from 'discord.js';

export default {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore messages from bots and DMs
        if (message.author.bot || !message.guild) return;

        // Check for Administrator permissions
        if (message.member.permissions.has('Administrator')) {
            return; // Ignore admins
        }

        // Whitelist GIF and media domains
        const whitelistedDomains = [
            'tenor.com',
            'giphy.com',
            'media.discordapp.net',
            'cdn.discordapp.com',
            'media.tenor.com',
            'media.giphy.com',
            'images-ext-1.discordapp.net',
            'images-ext-2.discordapp.net'
        ];

        const urlRegex = /(https?|www):\/\/[^\s/$.?#].[^\s]*|\w+\.\w{2,}\/[^\s]*/gi;
        const urls = message.content.match(urlRegex);

        if (urls) {
            // Check if any URL is NOT from whitelisted domains
            const hasNonWhitelistedUrl = urls.some(url => {
                return !whitelistedDomains.some(domain => url.toLowerCase().includes(domain));
            });

            if (hasNonWhitelistedUrl) {
                try {
                    await message.delete();
                    const dmContent = `Your message in ${message.guild.name} was removed because it contained a link. GIFs are allowed, but other links are restricted. (This is an automated message).`;
                    await message.author.send(dmContent);
                    console.log(`Deleted message with link from ${message.author.tag} in #${message.channel.name}.`);
                } catch (error) {
                    console.error(`Could not delete message or DM ${message.author.tag}:`, error);
                    // If DM fails, log it but still delete the message.
                    if (error.code === 50007) { // Cannot send messages to this user
                        console.log(`Could not DM ${message.author.tag} (DMs likely closed).`);
                    } else {
                        console.error(`Error sending DM to ${message.author.tag}:`, error);
                    }
                }
            }
        }
    },
};
