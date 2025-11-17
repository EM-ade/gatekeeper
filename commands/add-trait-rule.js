import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import * as guildVerificationConfigStore from '../repositories/guildVerificationConfigsRepository.js';

const builder = new SlashCommandBuilder()
  .setName('trait-rule')
  .setDescription('Manage trait-based verification rules for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('add')
      .setDescription('Add a trait-based verification rule')
      .addStringOption((option) =>
        option
          .setName('contract')
          .setDescription('NFT collection contract address')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('trait-type')
          .setDescription('Trait attribute name (e.g., CLASS, BACKGROUND)')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('trait-value')
          .setDescription('Required trait value (e.g., King, Wizard, Noble)')
          .setRequired(true),
      )
      .addRoleOption((option) =>
        option
          .setName('role')
          .setDescription('Discord role to assign when the trait is owned')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('remove')
      .setDescription('Remove a trait-based verification rule')
      .addStringOption((option) =>
        option
          .setName('contract')
          .setDescription('NFT collection contract address')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('trait-type')
          .setDescription('Trait attribute name that was configured')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('trait-value')
          .setDescription('Trait value that was configured')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription('List all trait-based verification rules for this server'),
  );

export default {
  data: builder,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add':
        return handleAdd(interaction);
      case 'remove':
        return handleRemove(interaction);
      case 'list':
        return handleList(interaction);
      default:
        return interaction.reply({
          content: '❌ Unknown trait rule subcommand.',
          ephemeral: true,
        });
    }
  },
};

async function handleAdd(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const contractAddress = interaction.options.getString('contract', true).trim();
  const traitType = interaction.options.getString('trait-type', true).trim();
  const traitValue = interaction.options.getString('trait-value', true).trim();
  const role = interaction.options.getRole('role', true);

  try {
    await guildVerificationConfigStore.create({
      guildId: interaction.guildId,
      contractAddress,
      ruleType: 'trait',
      traitType,
      traitValue,
      requiredNftCount: 1,
      roleId: role.id,
      roleName: role.name,
    });

    await interaction.editReply({
      content: `✅ **Trait Rule Added**\n\n` +
        `**Collection:** \`${contractAddress.slice(0, 8)}...${contractAddress.slice(-6)}\`\n` +
        `**Trait:** ${traitType} = "${traitValue}"\n` +
        `**Role:** ${role}\n\n` +
        `Users who own an NFT with this trait will automatically receive the role.`,
    });
  } catch (error) {
    console.error('[trait-rule add] Error:', error);

    const errorMessage = error.message?.includes('duplicate')
      ? '❌ This trait rule already exists for this collection and role.'
      : `❌ Failed to add trait rule: ${error.message}`;

    await interaction.editReply({ content: errorMessage });
  }
}

async function handleRemove(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const contractAddress = interaction.options.getString('contract', true).trim();
  const traitType = interaction.options.getString('trait-type', true).trim();
  const traitValue = interaction.options.getString('trait-value', true).trim();

  try {
    const deleted = await guildVerificationConfigStore.deleteRule({
      guildId: interaction.guildId,
      contractAddress,
      traitType,
      traitValue,
    });

    if (!deleted || deleted.length === 0) {
      await interaction.editReply({
        content: 'ℹ️ No matching trait rule was found to remove.',
      });
      return;
    }

    await interaction.editReply({
      content: `🗑️ Removed trait rule for **${contractAddress}** where **${traitType} = "${traitValue}"**.`,
    });
  } catch (error) {
    console.error('[trait-rule remove] Error:', error);
    await interaction.editReply({
      content: `❌ Failed to remove trait rule: ${error.message}`,
    });
  }
}

async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const rules = await guildVerificationConfigStore.listByGuild(interaction.guildId);
    const traitRules = (rules || []).filter((rule) => rule.ruleType === 'trait');

    if (traitRules.length === 0) {
      await interaction.editReply({
        content: 'ℹ️ No trait rules configured yet. Use `/trait-rule add` to create one.',
      });
      return;
    }

    const lines = traitRules.map((rule, index) => {
      const roleText = rule.roleId ? `<@&${rule.roleId}>` : rule.roleName || '—';
      return `${index + 1}. **${rule.contractAddress}** → ${rule.traitType} = "${rule.traitValue}" → ${roleText}`;
    });

    await interaction.editReply({
      content: ['📜 **Trait Verification Rules**', ...lines].join('\n'),
    });
  } catch (error) {
    console.error('[trait-rule list] Error:', error);
    await interaction.editReply({ content: '❌ Failed to fetch trait rules. Please try again later.' });
  }
}
