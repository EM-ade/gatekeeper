import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { verificationSessionService, VerificationSessionError } from '../services/verificationSessionService.js';
import { registerInteraction } from '../services/sessionInteractionRegistry.js';
import * as botConfigsRepository from '../repositories/botConfigsRepository.js';

function buildVerificationLink(token) {
  const baseUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || process.env.ALLOWED_ORIGIN?.replace(/\/$/, '');
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/session/${encodeURIComponent(token)}`;
}

function buildSuccessEmbed({ walletAddress, expiresAt, verificationUrl }) {
  const embed = new EmbedBuilder()
    .setColor('#8B008B')
    .setTitle('🔐 Continue NFT Verification')
    .setDescription(
      'We created a secure verification session for your wallet. Click the button below to finish verification on the portal.'
    )
    .addFields(
      {
        name: 'Wallet Address',
        value: `\`${walletAddress}\``,
        inline: false,
      },
      {
        name: 'Session Expires',
        value: expiresAt
          ? new Date(expiresAt).toLocaleString()
          : '10 minutes',
        inline: true,
      },
      {
        name: 'Next Steps',
        value:
          '1. Open the verification portal\n2. Connect your wallet\n3. Sign the verification message\n4. Return to Discord – roles update automatically',
        inline: false,
      }
    )
    .setTimestamp();

  const button = new ButtonBuilder()
    .setLabel('Open Verification Portal')
    .setStyle(ButtonStyle.Link)
    .setURL(verificationUrl);

  const row = new ActionRowBuilder().addComponents(button);

  return { embed, components: [row] };
}

export async function handleVerifyButton(interaction) {
  // Ensure we're in a guild context
  if (!interaction.guild || !interaction.guildId) {
    try {
      await interaction.reply({
        content: '❌ This command can only be used in a server, not in DMs.',
        ephemeral: true,
      });
    } catch (error) {
      console.error('Failed to reply with guild error:', error);
    }
    return;
  }

  // Defer immediately to prevent timeout
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (deferError) {
    console.error('Failed to defer interaction:', deferError);
    // If we can't defer, try to reply directly
    try {
      await interaction.reply({
        content: '❌ Interaction expired. Please try clicking the button again.',
        ephemeral: true,
      });
    } catch (replyError) {
      console.error('Failed to reply to interaction:', replyError);
    }
    return;
  }

  try {
    const session = await verificationSessionService.createSession({
      discordId: interaction.user.id,
      guildId: interaction.guildId,
      username: interaction.user.username,
    });

    registerInteraction(session.token, {
      interactionId: interaction.id,
      interactionToken: interaction.token,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    const verificationUrl = buildVerificationLink(session.token);
    if (!verificationUrl) {
      throw new VerificationSessionError(
        'Verification portal URL is not configured. Please contact an administrator.',
        500
      );
    }

    const { embed, components } = buildSuccessEmbed({
      walletAddress: 'Connect in portal',
      expiresAt: session.expiresAt,
      verificationUrl,
    });

    await interaction.editReply({
      embeds: [embed],
      components,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error creating verification session from button:', error);
    
    try {
      const errorMessage = error instanceof VerificationSessionError
        ? `❌ ${error.message}`
        : '❌ Failed to start verification session. Please try again later.';
      
      await interaction.editReply({
        content: errorMessage,
        ephemeral: true,
      });
    } catch (editError) {
      console.error('Failed to edit reply with error message:', editError);
    }
  }
}

// Modal handler removed - verification now uses portal-based flow
// The verification is completed through the web portal, not through Discord modals
