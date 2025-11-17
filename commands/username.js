import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getUserData } from '../data/userWallets.js';
import { getFusedCharacter, createOrUpdateFusedCharacter } from '../data/fusedCharacters.js';
import { getRealmkinNftsByOwner } from '../utils/solana.js';
import { getMultipleNftsMetadata } from '../utils/nftMetadata.js';

export default {
  data: new SlashCommandBuilder()
    .setName('username')
    .setDescription('Set your character username and complete your profile'),

  async execute(interaction) {
    // Check if user has linked wallet
    const userData = await getUserData(interaction.user.id);
    if (!userData || !userData.wallet_address) {
      return interaction.reply({
        content: '❌ You need to link your Solana wallet first using `/check-nft` to set a username.',
        ephemeral: true
      });
    }

    // Check if user already has a username
    const fusedCharacter = await getFusedCharacter(interaction.user.id);
    if (fusedCharacter && fusedCharacter.username) {
      return interaction.reply({
        content: `❌ You already have a username set: **${fusedCharacter.username}**. If you want to change it, please contact an admin.`,
        ephemeral: true
      });
    }

    // Create the modal
    const modal = new ModalBuilder()
      .setCustomId('usernameModal')
      .setTitle('Create Your Character Username');

    // Add components to modal
    const usernameInput = new TextInputBuilder()
      .setCustomId('usernameInput')
      .setLabel('Choose your character username')
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(20)
      .setPlaceholder('Enter a unique username (3-20 characters)')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(usernameInput);
    modal.addComponents(firstActionRow);

    // Show the modal to the user
    await interaction.showModal(modal);
  }
};

// Handle modal submission
export const handleUsernameModal = async (interaction) => {
  const username = interaction.fields.getTextInputValue('usernameInput');
  
  // Validate username format
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return interaction.reply({
      content: '❌ Username can only contain letters, numbers, and underscores.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Get user data and NFTs
    const userData = await getUserData(interaction.user.id);
    const userNfts = await getRealmkinNftsByOwner(userData.wallet_address);
    const nftIds = userNfts.map(nft => nft.value);
    const nftMetadata = await getMultipleNftsMetadata(nftIds);

    // Create or update fused character with username
    const fusedCharacter = await createOrUpdateFusedCharacter(interaction.user.id, nftMetadata, username);

    if (fusedCharacter) {
      await interaction.editReply({
        content: `🎉 Username set successfully! Welcome, **${username}**!\n\n` +
                 `**Character Stats:**\n` +
                 `• Level: ${fusedCharacter.level}\n` +
                 `• Archetype: ${fusedCharacter.archetype}\n` +
                 `• Attack: ${fusedCharacter.total_attack}\n` +
                 `• Defense: ${fusedCharacter.total_defense}\n` +
                 `• HP: ${fusedCharacter.max_hp}\n\n` +
                 `Use \`/profile\` to view your complete character profile!`,
        ephemeral: true
      });

      // Send a public welcome message
      await interaction.channel.send({
        content: `🌟 **Welcome ${username} to the Realmkin community!** 🌟\n` +
                 `A new ${fusedCharacter.archetype.toLowerCase()} has joined the ranks, fused from ${nftMetadata.length} Realmkins!`,
        ephemeral: false
      });
    } else {
      await interaction.editReply({
        content: '❌ Failed to create your character. Please try again or contact support.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error setting username:', error);
    await interaction.editReply({
      content: '❌ An error occurred while setting your username. Please try again.',
      ephemeral: true
    });
  }
};
