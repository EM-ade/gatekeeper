import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const builder = new SlashCommandBuilder()
  .setName('special-roles')
  .setDescription('Manage special role assignments based on NFT metadata')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('configure')
      .setDescription('Configure a special role for a trait value')
      .addStringOption((option) =>
        option
          .setName('trait-value')
          .setDescription('The trait value (e.g., King, Priest, Wizard)')
          .setRequired(true),
      )
      .addRoleOption((option) =>
        option
          .setName('role')
          .setDescription('The Discord role to assign')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('update')
      .setDescription('Manually trigger special role updates for all users'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription('List all configured special roles'),
  );

export default {
  data: builder,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'configure':
        return handleConfigure(interaction);
      case 'update':
        return handleUpdate(interaction);
      case 'list':
        return handleList(interaction);
      default:
        return interaction.reply({
          content: '❌ Unknown special roles subcommand.',
          ephemeral: true,
        });
    }
  },
};

async function handleConfigure(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const traitValue = interaction.options.getString('trait-value', true).trim();
  const role = interaction.options.getRole('role', true);

  try {
    // Get the periodic verification service instance
    const periodicService = global.periodicVerificationService;
    if (!periodicService) {
      return interaction.editReply({
        content: '❌ Periodic verification service not available.',
      });
    }

    // Set the special role mapping
    periodicService.setSpecialRole(traitValue, role.id, role.name);

    await interaction.editReply({
      content: `✅ **Special Role Configured**\n\n` +
        `**Trait Value:** "${traitValue}"\n` +
        `**Role:** ${role}\n\n` +
        `Users who own an NFT with Class = "${traitValue}" will automatically receive this role.`,
    });
  } catch (error) {
    console.error('[special-roles configure] Error:', error);
    await interaction.editReply({
      content: `❌ Failed to configure special role: ${error.message}`,
    });
  }
}

async function handleUpdate(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get the periodic verification service instance
    const periodicService = global.periodicVerificationService;
    if (!periodicService) {
      return interaction.editReply({
        content: '❌ Periodic verification service not available.',
      });
    }

    // Trigger an immediate verification check
    await periodicService.runVerificationCheck();

    await interaction.editReply({
      content: `✅ Special role updates have been triggered for all users.\n\nThis may take a few minutes to complete depending on the number of users.`,
    });
  } catch (error) {
    console.error('[special-roles update] Error:', error);
    await interaction.editReply({
      content: `❌ Failed to trigger special role updates: ${error.message}`,
    });
  }
}

async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get the periodic verification service instance
    const periodicService = global.periodicVerificationService;
    if (!periodicService) {
      return interaction.editReply({
        content: '❌ Periodic verification service not available.',
      });
    }

    // Get all configured special roles
    const specialRoles = periodicService.specialRoles;
    
    if (specialRoles.size === 0) {
      await interaction.editReply({
        content: 'ℹ️ No special roles configured yet. Use `/special-roles configure` to create one.',
      });
      return;
    }

    const lines = [];
    for (const [traitValue, roleInfo] of specialRoles) {
      const roleText = roleInfo.roleId ? `<@&${roleInfo.roleId}>` : roleInfo.roleName || '—';
      lines.push(`• **${traitValue}** → ${roleText}`);
    }

    await interaction.editReply({
      content: ['📜 **Configured Special Roles**', ...lines].join('\n'),
    });
  } catch (error) {
    console.error('[special-roles list] Error:', error);
    await interaction.editReply({
      content: `❌ Failed to fetch special roles: ${error.message}`,
    });
  }
}
