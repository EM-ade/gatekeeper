import { SlashCommandBuilder } from "discord.js";
import { getRealmkinNftsByOwner, scanRealmkinNfts } from "../utils/solana.js";
import { getMultipleNftsMetadata } from "../utils/nftMetadata.js";
import { saveUserData } from "../data/userWallets.js";
import { createOrUpdateFusedCharacter } from "../data/fusedCharacters.js";

// NOTE: The collection identifiers (address for Helius, symbol for Magic Eden)
// are now managed within utils/solana.js. This file just needs to call the unified function.

const hasRequiredNft = async (walletAddress) => {
  const { combined } = await scanRealmkinNfts(walletAddress);
  return combined.length > 0;
};

export default {
  data: new SlashCommandBuilder()
    .setName("check-nft")
    .setDescription("Checks if a user holds the required Realmkin NFT.")
    .addStringOption((option) =>
      option
        .setName("wallet_address")
        .setDescription("Your Solana wallet address.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("method")
        .setDescription("Choose NFT checking method (Magic Eden is recommended).")
        .setRequired(false)
        .addChoices(
          { name: 'Auto (Magic Eden First)', value: 'auto' },
          { name: 'Magic Eden (Public)', value: 'magiceden' },
          { name: 'Helius (API Required)', value: 'helius' }
        )
    ),
  async execute(interaction) {
    const walletAddress = interaction.options.getString("wallet_address");
    const method = interaction.options.getString("method") || 'auto';
    const member = interaction.member;

    const gateKeyRole = interaction.guild.roles.cache.find(
      (role) => role.name === "Gate Key"
    );
    if (!gateKeyRole || !member.roles.cache.has(gateKeyRole.id)) {
      return interaction.reply({
        content: 'You must have the "Gate Key" role to use this command.',
        ephemeral: true,
      });
    }

    const holderRole = interaction.guild.roles.cache.find(
      (role) => role.name === "Kin Holder"
    );
    if (!holderRole) {
      console.error("The 'Kin Holder' role does not exist on this server.");
      return interaction.reply({
        content:
          'The "Kin Holder" role is not configured on this server. Please contact an admin.',
        ephemeral: true,
      });
    }

    // Defer reply as the NFT check might take time
    await interaction.deferReply({ ephemeral: true });

    try {
      const scanResult = await scanRealmkinNfts(walletAddress);
      const combinedNfts = scanResult.combined;
      const magicEdenCount = scanResult.sources.magicEden.nfts.length;
      const heliusCount = scanResult.sources.helius.nfts.length;
      const heliusError = scanResult.sources.helius.error;
      const totalFound = combinedNfts.length;

      if (method === 'helius' && heliusError) {
        await interaction.editReply({
          content: `❌ **Helius scan unavailable.** ${heliusError}`,
          ephemeral: true,
        });
        return;
      }

      if (method === 'magiceden' && magicEdenCount === 0 && totalFound === 0) {
        await interaction.editReply({
          content: "❌ **Magic Eden scan found no Realmkin NFTs** in the provided wallet.\n\n**Please verify:**\n• The wallet address is correct\n• You own at least one Realmkin NFT\n• The NFT is from the official Realmkin collection\n\n*Try the 'Auto' method or contact an administrator if you believe this is an error.*",
          ephemeral: true,
        });
        return;
      }

      if (totalFound === 0) {
        let errorMessage = "❌ **No Realmkin NFTs found** in the provided wallet address.\n\n";
        errorMessage += "**Magic Eden:** " + (magicEdenCount > 0 ? `${magicEdenCount} detected` : "0 detected") + "\n";
        errorMessage += "**Helius:** ";
        if (heliusError) {
          errorMessage += `Unavailable (${heliusError})\n`;
        } else {
          errorMessage += `${heliusCount} detected\n`;
        }
        errorMessage += "\n**Please verify:**\n";
        errorMessage += "• The wallet address is correct\n";
        errorMessage += "• You own at least one Realmkin NFT\n";
        errorMessage += "• The NFT is from the official Realmkin collection\n";
        errorMessage += "\n*If you believe this is an error, please contact an administrator.*";

        await interaction.editReply({
          content: errorMessage,
          ephemeral: true,
        });
        return;
      }

      const methodHighlights = [];
      if (magicEdenCount > 0) {
        methodHighlights.push(`Magic Eden: **${magicEdenCount}** Realmkin NFTs`);
      } else {
        methodHighlights.push(`Magic Eden: 0 Realmkin NFTs`);
      }
      if (heliusError) {
        methodHighlights.push(`Helius: unavailable (${heliusError})`);
      } else {
        methodHighlights.push(`Helius: **${heliusCount}** Realmkin NFTs`);
      }

      await interaction.editReply({
        content: `🔍 **Wallet Scan Complete!**\n${methodHighlights.join("\n")}\n\nTotal detected Realmkin NFTs: **${totalFound}**.\n\nYour Kin are ready to merge into a powerful champion!`,
        ephemeral: true,
      });

      // Notify if requested method produced no results but other source did
      if (method === 'magiceden' && magicEdenCount === 0 && totalFound > 0) {
        await interaction.followUp({
          content: "⚠️ Magic Eden returned no Realmkin NFTs, but other sources found valid Realmkin NFTs. Verification will continue using the combined results.",
          ephemeral: true,
        });
      }
      if (method === 'helius' && heliusCount === 0 && !heliusError && totalFound > 0) {
        await interaction.followUp({
          content: "⚠️ Helius returned no Realmkin NFTs, but other sources found valid Realmkin NFTs. Verification will continue using the combined results.",
          ephemeral: true,
        });
      }

      // Process NFTs (common path after a successful scan)
      const nftIds = combinedNfts.map((nft) => nft.value);

      // Step 2: Fetch detailed metadata
      const nftMetadata = await getMultipleNftsMetadata(nftIds);

      // Step 3: Create fused character without username first
      const fusedCharacter = await createOrUpdateFusedCharacter(
        member.user.id,
        nftMetadata
      );

      // Only add role if they don't already have it
      const alreadyHadRole = member.roles.cache.has(holderRole.id);
      if (!alreadyHadRole) {
        await member.roles.add(holderRole);
      }
       
      await saveUserData(member.user.id, walletAddress, null);

      if (fusedCharacter) {
        // Step 4: Show fusion results and prompt for username
        await interaction.followUp({
          content: `✨ **Character Fusion ${alreadyHadRole ? 'Updated' : 'Complete'}!**\n\nYour ${nftMetadata.length} Realmkins have ${alreadyHadRole ? 'been updated to create' : 'merged into'} a powerful level ${fusedCharacter.level} ${fusedCharacter.archetype}!\n\n**Character Stats:**\n⚔️ Attack: ${fusedCharacter.total_attack}\n🛡️ Defense: ${fusedCharacter.total_defense}\n❤️ HP: ${fusedCharacter.max_hp}\n\n**Next Step:** Use \`/username\` to name your champion and complete your profile!`,
          ephemeral: false,
        });

        // Public welcome message only for new holders
        if (!alreadyHadRole) {
          interaction.channel.send(
            `🌟 Welcome ${
              interaction.user.username
            } to the Kin Holder ranks! A new ${fusedCharacter.archetype.toLowerCase()} champion has been forged from ${
              nftMetadata.length
            } Realmkins!`
          );
        }
      } else {
        await interaction.followUp({
          content: `✅ **Wallet ${alreadyHadRole ? 'Re-verified' : 'Verified'}!**\n${alreadyHadRole ? 'Your wallet has been updated' : 'You have been granted the Kin Holder role'}!\n\n**Next Step:** Use \`/username\` to create your character and complete your profile.`,
          ephemeral: false,
        });
      }

    } catch (error) {
      console.error('Error in /check-nft command:', error);
      console.error('Wallet address:', walletAddress);
      console.error('Method used:', method);
      
      // Provide more specific error information
      let errorMessage = '❌ **An error occurred while checking your wallet.**\n\n';
      
      if (error.message && error.message.includes('fetch')) {
        errorMessage += '**Issue:** Network connectivity problem\n';
        errorMessage += '**Solution:** Please try again in a few moments\n';
      } else if (error.message && error.message.includes('API')) {
        errorMessage += '**Issue:** API service temporarily unavailable\n';
        errorMessage += '**Solution:** Please try again later or contact support\n';
      } else {
        errorMessage += '**Issue:** Unexpected error occurred\n';
        errorMessage += '**Solution:** Please contact an administrator\n';
      }
      
      errorMessage += '\n*If this problem persists, please provide your wallet address to support.*';
      
      await interaction.editReply({
        content: errorMessage,
        ephemeral: true,
      });
    }
  },
};
