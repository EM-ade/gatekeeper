import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import * as guildVerificationConfigStore from '../repositories/guildVerificationConfigsRepository.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verification-config')
    .setDescription('Manage contract verification rules for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List configured verification contract rules'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add or update a verification contract rule')
        .addStringOption((option) =>
          option
            .setName('contract_address')
            .setDescription('NFT contract address to verify against')
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('required_nfts')
            .setDescription('Minimum NFTs required for the role (default 1)')
            .setMinValue(1),
        )
        .addIntegerOption((option) =>
          option
            .setName('max_nfts')
            .setDescription('Optional maximum NFTs for range (exclusive upper tier)')
            .setMinValue(1),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Discord role to assign when the threshold is met'),
        )
        .addStringOption((option) =>
          option
            .setName('role_name')
            .setDescription('Fallback role name if the role option is unavailable'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a verification contract rule')
        .addStringOption((option) =>
          option
            .setName('contract_address')
            .setDescription('NFT contract address to remove')
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('required_nfts')
            .setDescription('If provided, only remove the rule matching this NFT threshold')
            .setMinValue(1),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'list':
        return handleList(interaction);
      case 'add':
        return handleAdd(interaction);
      case 'remove':
        return handleRemove(interaction);
      default:
        return interaction.reply({
          content: '❌ Unknown subcommand.',
          ephemeral: true,
        });
    }
  }
};

async function handleList(interaction) {
  try {
    const rules = await guildVerificationConfigStore.listByGuild(interaction.guild.id);

    if (!rules || rules.length === 0) {
      return interaction.reply({
        content:
          'ℹ️ No verification contract rules configured yet. Use `/verification-config add` to create one.',
        ephemeral: true,
      });
    }

  const lines = rules.map((rule, index) => {
    const roleText = rule.roleId
      ? `<@&${rule.roleId}>`
      : rule.roleName || '—';
    const rangeText = rule.maxNftCount && Number.isInteger(rule.maxNftCount)
      ? `${rule.requiredNftCount}-${rule.maxNftCount}`
      : `${rule.requiredNftCount}+`;
    return `${index + 1}. **${rule.contractAddress}** → require **${rangeText}** NFT(s) → role ${roleText}`;
  });

    const header = '📋 **Verification Contract Rules**';
    const chunks = [];
    let current = header;
    for (const line of lines) {
      if ((current + '\n' + line).length > 1900) {
        chunks.push(current);
        current = line;
      } else {
        current = current === header ? `${header}\n${line}` : `${current}\n${line}`;
      }
    }
    if (current) chunks.push(current);

    await interaction.reply({ content: chunks[0], ephemeral: true });
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }
    return;
  } catch (error) {
    console.error('Failed to list verification contract rules:', error);
    return interaction.reply({
      content: '❌ Failed to fetch rules. Please try again later.',
      ephemeral: true,
    });
  }
}

async function handleAdd(interaction) {
  const contractAddressRaw = interaction.options.getString('contract_address', true);
  const contractAddress = contractAddressRaw.trim();
  const requiredNfts = interaction.options.getInteger('required_nfts') || 1;
  const maxNfts = interaction.options.getInteger('max_nfts');
  const roleOption = interaction.options.getRole('role');
  const roleNameOption = interaction.options.getString('role_name');

  if (!contractAddress) {
    return interaction.reply({
      content: '❌ Contract address cannot be empty.',
      ephemeral: true,
    });
  }

  const payload = {
    guildId: interaction.guild.id,
    contractAddress,
    requiredNftCount: requiredNfts,
    maxNftCount: maxNfts ?? null,
    roleId: roleOption?.id || null,
    roleName: roleOption?.name || roleNameOption || null,
  };

  try {
    await guildVerificationConfigStore.upsertRule(payload);

    return interaction.reply({
      content:
        `✅ Saved verification rule for **${contractAddress}**\n• Required NFTs: **${maxNfts ? `${requiredNfts}-${maxNfts}` : `${requiredNfts}+`}**\n• Role: **${payload.roleId ? `<@&${payload.roleId}>` : payload.roleName || '—'}**`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Failed to upsert verification contract rule:', error);
    return interaction.reply({
      content: '❌ Failed to save the rule. Please try again later.',
      ephemeral: true,
    });
  }
}

async function handleRemove(interaction) {
  const contractAddressRaw = interaction.options.getString('contract_address', true);
  const contractAddress = contractAddressRaw.trim();
  const requiredNfts = interaction.options.getInteger('required_nfts');
  const maxNfts = interaction.options.getInteger('max_nfts');

  if (!contractAddress) {
    return interaction.reply({
      content: '❌ Contract address cannot be empty.',
      ephemeral: true,
    });
  }

  try {
    await guildVerificationConfigStore.deleteRule({
      guildId: interaction.guild.id,
      contractAddress,
      requiredNftCount: requiredNfts ?? null,
      maxNftCount: maxNfts ?? null,
    });

    return interaction.reply({
      content: requiredNfts || maxNfts
        ? `🗑️ Removed verification rule for **${contractAddress}** at **${requiredNfts || '?'}${maxNfts ? `-${maxNfts}` : '+'}** NFT(s)`
        : `🗑️ Removed verification rule(s) for **${contractAddress}**`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Failed to delete verification contract rule:', error);
    return interaction.reply({
      content: '❌ Failed to delete the rule. Please try again later.',
      ephemeral: true,
    });
  }
}
