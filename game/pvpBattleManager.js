import { recordKill, getSessionById, completeSession } from '../data/pvpSessions.js';
import { creditReward, deductStake, getBalance } from '../utils/pvpWallet.js';
import { getFusedCharacter } from '../data/fusedCharacters.js';
import { generateTrainingEnemy } from './fusedCombatEngine.js';
import { startFusedBattle } from './fusedBattleSystem.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const activeSessions = new Map(); // sessionId -> { endsAt, channelId, players: Set<userId> }

export function isSessionActive(sessionId) {
  const s = activeSessions.get(sessionId);
  return !!s && Date.now() < s.endsAt;
}

export async function startSessionTimer(client, session, channel) {
  const endsAt = new Date(session.ends_at || Date.now() + session.duration_minutes * 60000).getTime();
  activeSessions.set(session.session_id, { endsAt, channelId: channel.id, players: new Set() });

  // Announce session start
  const embed = new EmbedBuilder()
    .setTitle('🏁 PvP Kill Race Started!')
    .setDescription(`Players: <@${session.player_a_id}> vs <@${session.player_b_id}>\nDuration: ${session.duration_minutes} minutes\nPrize: ${session.stake_amount * 2} MKIN`)
    .setColor(0xDA9C2F);
  await channel.send({ embeds: [embed] });

  // Schedule end
  const msLeft = Math.max(0, endsAt - Date.now());
  setTimeout(async () => {
    try {
      await finalizeSession(client, session.session_id, channel);
    } catch (e) {
      console.error('Failed to finalize PvP session:', e);
    } finally {
      activeSessions.delete(session.session_id);
    }
  }, msLeft);
}

export async function startPlayerRun(interaction, sessionId) {
  const session = await getSessionById(sessionId);
  if (!session || session.status !== 'active') {
    return interaction.reply({ content: 'This PvP session is no longer active.', ephemeral: true });
  }
  if (!isSessionActive(sessionId)) {
    return interaction.reply({ content: 'This PvP session has ended.', ephemeral: true });
  }

  const userId = interaction.user.id;
  if (userId !== session.player_a_id && userId !== session.player_b_id) {
    return interaction.reply({ content: 'You are not a participant in this session.', ephemeral: true });
  }

  // Load fused character
  const fused = await getFusedCharacter(userId);
  if (!fused) {
    return interaction.reply({ content: 'You need a fused champion to participate. Use /train to create one first.', ephemeral: true });
  }

  // Prepare player data for fused battle
  const playerData = {
    user_id: userId,
    username: fused.display_name || interaction.user.username,
    level: fused.level || fused.tier_level || 1,
    archetype: fused.archetype || 'Adventurer',
    tier: fused.tier || 1,
    total_attack: fused.total_attack || 50,
    total_defense: fused.total_defense || 50,
    max_hp: fused.max_hp || 100,
    current_hp: fused.max_hp || 100,
  };

  const enemy = generateTrainingEnemy(playerData.tier || playerData.level || 1);

  await interaction.deferReply({ ephemeral: true });

  const onBattleEnd = async ({ result }) => {
    try {
      if (!isSessionActive(sessionId)) return; // stop counting after end
      if (result === 'victory') {
        await recordKill(sessionId, userId, 1);
      }
    } catch (e) {
      console.error('PvP onBattleEnd hook failed:', e);
    }
  };

  await startFusedBattle(interaction, playerData, enemy, 'training', onBattleEnd);
}

export async function finalizeSession(client, sessionId, channel) {
  const session = await getSessionById(sessionId);
  if (!session) return;

  const killsA = session.player_a_kills || 0;
  const killsB = session.player_b_kills || 0;

  let winner = null;
  if (killsA > killsB) winner = session.player_a_id;
  else if (killsB > killsA) winner = session.player_b_id;

  // Payouts
  if (winner) {
    await creditReward(winner, session.stake_amount * 2, session.session_id);
  } else {
    // tie: return stakes
    await creditReward(session.player_a_id, session.stake_amount, session.session_id);
    await creditReward(session.player_b_id, session.stake_amount, session.session_id);
  }

  await completeSession(session.session_id, winner);

  const embed = new EmbedBuilder()
    .setTitle('🏁 PvP Kill Race Complete')
    .addFields(
      { name: 'Player A', value: `<@${session.player_a_id}> — ${killsA} kills`, inline: true },
      { name: 'Player B', value: `<@${session.player_b_id}> — ${killsB} kills`, inline: true },
      { name: 'Outcome', value: winner ? `🏆 Winner: <@${winner}>` : '🤝 Tie — stakes returned', inline: false },
    )
    .setColor(winner ? 0x00D4AA : 0xFF6B35);

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.warn('Failed to announce PvP result:', e?.message || e);
  }
}

export async function ensureStakeBalancesOrThrow(challengerId, challengedId, stake, challengeId) {
  const balA = await getBalance(challengerId);
  const balB = await getBalance(challengedId);
  if (balA < stake) throw new Error('Challenger has insufficient funds');
  if (balB < stake) throw new Error('Challenged user has insufficient funds');

  // Deduct both atomically-ish; if second fails, first will still be deducted but apply_ledger_entry should be idempotent per ref
  await deductStake(challengerId, stake, challengeId, 'challenger');
  await deductStake(challengedId, stake, challengeId, 'challenged');
}
