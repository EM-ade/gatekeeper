import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserData, getUnifiedBalanceByDiscord } from '../data/userWallets.js';
import { getFusedCharacter } from '../data/fusedCharacters.js';
import { getRealmkinNftsByOwner } from '../utils/solana.js';
import { getMultipleNftsMetadata } from '../utils/nftMetadata.js';

// Element to color mapping
const ELEMENT_COLORS = {
  FIRE: 0xFF0000,      // Red
  NATURE: 0x00FF00,    // Green
  LIGHTNING: 0xFFFF00, // Yellow
  LIGHT: 0xFFFFFF,     // White
  NEUTRAL: 0x808080    // Gray
};

// Archetype emoji mapping
const ARCHETYPE_EMOJIS = {
  BERSERKER: '⚔️',
  GUARDIAN: '🛡️',
  MAGE: '🧙',
  ADVENTURER: '🧭'
};

// Archetype descriptions
const ARCHETYPE_DESCRIPTIONS = {
  BERSERKER: 'A fierce warrior focused on overwhelming offense',
  GUARDIAN: 'A stalwart protector with exceptional defensive capabilities',
  MAGE: 'A versatile spellcaster with diverse elemental affinities',
  ADVENTURER: 'A balanced hero adaptable to any situation'
};

// XP required per level (tier-aware)
const getXpForNextLevel = (currentLevel, tier = 1) => {
  const XP_REQUIREMENTS = {
    1: 100, 2: 220, 3: 360, 4: 520, 5: 700,
    6: 900, 7: 1120, 8: 1360, 9: 1620, 10: 1900,
    11: 2200, 12: 2520, 13: 2860, 14: 3220, 15: 3600,
    16: 4000, 17: 4420, 18: 4860, 19: 5320, 20: 5800,
    21: 6400, 22: 7100, 23: 7900, 24: 8800, 25: 9800
  };
  
  const base = XP_REQUIREMENTS[currentLevel] || (currentLevel * currentLevel * 100);
  // Align with combat engines: T1 x1.0, T2 x1.3, T3 x1.7, T4 x2.2
  const tierMults = [0, 1.0, 1.3, 1.7, 2.2];
  const mult = tierMults[Math.min(Math.max(tier, 1), 4)];
  return Math.floor(base * mult);
};

/**
 * Generate XP progress bar
 */
const generateXpProgressBar = (currentXp, xpNeeded, length = 10) => {
  const percentage = Math.min(1, currentXp / xpNeeded);
  const filled = Math.floor(percentage * length);
  const empty = length - filled;
  
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.floor(percentage * 100)}%`;
};

/**
 * Get dominant element from affinities
 */
const getDominantElement = (affinities) => {
  if (!affinities) return 'NEUTRAL';
  
  let dominantElement = 'NEUTRAL';
  let highestAffinity = 0;
  
  for (const [element, affinity] of Object.entries(affinities)) {
    if (affinity > highestAffinity) {
      highestAffinity = affinity;
      dominantElement = element;
    }
  }
  
  return dominantElement;
};

/**
 * Format elemental affinities for display
 */
const formatElementalAffinities = (affinities) => {
  if (!affinities) return 'None';
  
  const elements = ['FIRE', 'NATURE', 'LIGHTNING', 'LIGHT', 'NEUTRAL'];
  return elements
    .map(element => {
      const affinity = affinities[element] || 0;
      return `${element.charAt(0)}: ${Math.round(affinity * 100)}%`;
    })
    .join(' • ');
};

/**
 * Create Fused Character Profile embed
 */
const createFusedProfileEmbed = async (fusedCharacter, userData, totalNFTs, interaction) => {
  const tier = fusedCharacter.tier || 1;
  const tierLevel = fusedCharacter.tier_level || fusedCharacter.level || 1;
  const tierXp = fusedCharacter.tier_xp ?? fusedCharacter.xp ?? 0;
  const xpNeeded = getXpForNextLevel(tierLevel, tier);
  const xpProgress = generateXpProgressBar(Math.min(tierXp, xpNeeded), xpNeeded);
  
  const dominantElement = getDominantElement(fusedCharacter.elemental_affinities);
  const archetypeEmoji = ARCHETYPE_EMOJIS[fusedCharacter.archetype] || '🧭';
  const archetypeDesc = ARCHETYPE_DESCRIPTIONS[fusedCharacter.archetype] || 'A versatile hero';

  const embed = new EmbedBuilder()
    .setTitle(`${archetypeEmoji} ${fusedCharacter.username || 'Fused Hero'} - Tier ${tier} • Level ${tierLevel} ${archetypeEmoji}`)
    .setColor(ELEMENT_COLORS[dominantElement] || 0x0099FF)
    .setDescription(`**${fusedCharacter.archetype}** - ${archetypeDesc}\n*Fused from ${totalNFTs} Realmkins*`)
    .addFields(
      {
        name: '⚔️ Combat Stats',
        value: `**Attack:** ${fusedCharacter.total_attack}\n**Defense:** ${fusedCharacter.total_defense}\n**HP:** ${fusedCharacter.current_hp}/${fusedCharacter.max_hp}`,
        inline: true
      },
      {
        name: '🌊 Elemental Affinities',
        value: formatElementalAffinities(fusedCharacter.elemental_affinities),
        inline: true
      },
      {
        name: '📊 Tier Progress',
        value: `**Tier:** ${tier}\n**Level:** ${tierLevel}\n**Tier XP:** ${Math.min(tierXp, xpNeeded)}/${xpNeeded}\n${xpProgress}`,
        inline: false
      }
    )
    .setFooter({ 
      text: `Kills: ${userData?.total_kills || 0}` 
    })
    .setTimestamp();

  // Add player avatar as thumbnail for visual identity
  if (interaction?.user?.displayAvatarURL) {
    try {
      embed.setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 128 }));
    } catch {}
  }

  return embed;
};

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your fused character profile and stats'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Get user's wallet data
    const userData = await getUserData(interaction.user.id);
    if (!userData || !userData.wallet_address) {
      return interaction.editReply({
        content: '❌ You need to link your Solana wallet first using `/check-nft` to view your profile.',
        ephemeral: true
      });
    }

    // Get fused character
    const fusedCharacter = await getFusedCharacter(interaction.user.id);
    if (!fusedCharacter) {
      return interaction.editReply({
        content: '❌ You need to verify your NFTs using `/check-nft` first to create your fused character.',
        ephemeral: true
      });
    }

    // Get total NFTs for context
    const userNfts = await getRealmkinNftsByOwner(userData.wallet_address);
    const totalNFTs = userNfts.length;

    // Resolve unified MKIN balance via user_links (discord_id -> user_id -> user_balances)
    let unifiedBalance = await getUnifiedBalanceByDiscord(interaction.user.id);
    if (typeof unifiedBalance !== 'number') unifiedBalance = 0;

    // Create profile embed
    const embed = await createFusedProfileEmbed(fusedCharacter, userData, totalNFTs, interaction);

    // Prepend unified MKIN to description/footer
    try {
      const footer = embed.data.footer?.text || '';
      const newFooter = `Total MKin: ${unifiedBalance} • ${footer || ''}`.trim();
      embed.setFooter({ text: newFooter });
    } catch {}
    
    await interaction.editReply({ embeds: [embed], ephemeral: true });
  }
};
