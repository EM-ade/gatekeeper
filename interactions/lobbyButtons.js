import { EmbedBuilder } from 'discord.js';
import { joinLobby, getLobbyDetails } from '../data/pvpLobbies.js';

export async function handleLobbyButtonInteraction(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('lobby_join_')) {
    const lobbyId = parseInt(customId.split('_')[2]);
    await handleJoinLobby(interaction, lobbyId);
  }
}

async function handleJoinLobby(interaction, lobbyId) {
  try {
    const result = await joinLobby(lobbyId, interaction.user.id);

    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    const lobby = await getLobbyDetails(lobbyId);
    if (!lobby) {
      return interaction.reply({ content: '❌ Lobby not found.', ephemeral: true });
    }

    const joinEmbed = new EmbedBuilder()
      .setTitle(`✅ Joined ${lobby.name}!`)
      .setDescription(`You've successfully joined the lobby.`)
      .addFields(
        { name: '👥 Participants', value: `${lobby.participants.length}/${lobby.max_participants}`, inline: true },
        { name: '🎮 Type', value: lobby.lobby_type === 'tournament' ? '🏆 Tournament' : '🎮 Casual', inline: true },
        { name: '💰 Entry Fee', value: lobby.entry_fee > 0 ? `${lobby.entry_fee} MKIN` : 'Free', inline: true }
      )
      .setColor(0x00D4AA);

    if (lobby.participants.length > 1) {
      const participantList = lobby.participants.map(p => `<@${p.discord_id}>`).join(', ');
      joinEmbed.addFields({
        name: '👥 Current Participants',
        value: participantList,
        inline: false
      });
    }

    await interaction.reply({ embeds: [joinEmbed], ephemeral: true });

    // Notify the channel if lobby is getting full or full
    if (lobby.participants.length >= lobby.max_participants) {
      const fullEmbed = new EmbedBuilder()
        .setTitle(`🎉 ${lobby.name} is now FULL!`)
        .setDescription(`All ${lobby.max_participants} spots have been filled. Ready to start!`)
        .setColor(0xFFD700);

      await interaction.followUp({ embeds: [fullEmbed] });
    } else if (lobby.participants.length >= lobby.max_participants * 0.8) {
      const notifyEmbed = new EmbedBuilder()
        .setTitle(`🔥 ${lobby.name} is filling up!`)
        .setDescription(`${lobby.participants.length}/${lobby.max_participants} participants joined.`)
        .setColor(0xFF6B35);

      await interaction.followUp({ embeds: [notifyEmbed] });
    }

  } catch (error) {
    console.error('Error joining lobby via button:', error);
    await interaction.reply({ content: '❌ Error joining lobby.', ephemeral: true });
  }
}
