/**
 * Bot Initialization — loads agents from DB, spawns bots, sets up AI agents.
 *
 * @module bridge/bot-init
 */

import { Agent } from '@prisma/client';
import {
  initializeNeeds,
} from '../bot-needs';
import {
  random256Color,
  randomBotWidth,
  randomBotHeight,
  randomBotShape,
  detectPersonality,
} from '../../src/lib/world-physics';
import { BotState } from '../../src/types/simulation';
import { BotAgent } from '../bot-agent-base';
import { PrismaConnector } from '../connectors/prisma-connector';
import { Personality } from '../config';

import {
  prisma,
  bots,
  worldConfig,
  agentInstances,
  bridgeState,
  ENABLE_AI_AGENTS,
  SQ_METERS_PER_BOT,
  MIN_GROUND_SIZE,
} from './state';
import { broadcast } from './broadcast';
import { createNeedsTracker, createLifetimeStats } from './helpers';
import { startAgentHeartbeats } from './agents';

// ─── Remote Reset ───────────────────────────────────────────────

export async function handleRemoteReset() {
  console.log('🔄 Remote reset triggered via WebSocket...');

  // Clear local state
  bots.clear();
  worldConfig.shelters = [];

  // Wipe DB
  try {
    await prisma.vote.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.post.deleteMany({});
    await prisma.shelter.deleteMany({});
    await prisma.agent.updateMany({
      data: {
        spawnDate: new Date(),
        totalWood: 0,
        totalStone: 0,
        totalWater: 0,
        totalFood: 0,
        reproductionCount: 0,
        childrenCount: 0,
        sheltersBuilt: 0,
        totalPosts: 0,
        totalComments: 0,
        totalUpvotes: 0,
        totalDownvotes: 0,
        waterRefillCount: 0,
        foodRefillCount: 0,
        helpCount: 0,
      },
    });

    // Re-initialize
    await initializeBots();

    // Broadcast status to all viewers
    broadcast({ type: 'sim:reset:complete' });
    console.log('✅ Remote reset completed.');
  } catch (err) {
    console.error('❌ Remote reset failed:', err);
  }
}

// ─── Initialize Bots from Database ──────────────────────────────

export async function initializeBots() {
  try {
    const agents = await prisma.agent.findMany({
      where: { enabled: true },
    });

    if (agents.length === 0) {
      console.log('⚠️  No enabled agents in DB. Spawning 4 default bots for demo...');
      const defaults = [
        { name: 'TechBot', personality: 'tech' },
        { name: 'PhilosopherBot', personality: 'philo' },
        { name: 'ArtBot', personality: 'art' },
        { name: 'ScienceBot', personality: 'science' },
      ];
      for (const d of defaults) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 8;
        const bot: BotState = {
          botId: `demo-${d.name}`,
          botName: d.name,
          personality: d.personality,
          x: Math.cos(angle) * dist,
          y: 0,
          z: Math.sin(angle) * dist,
          targetX: 0, targetY: 0, targetZ: 0,
          state: 'idle',
          width: randomBotWidth(),
          height: randomBotHeight(),
          color: random256Color(),
          shape: randomBotShape(),
          inventory: { wood: 0, stone: 0, water: 0, food: 0 },
          needsPostTracker: createNeedsTracker(),
          path: [],
          pathIndex: 0,
          lifetimeStats: createLifetimeStats(),
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;

        bot.needs = initializeNeeds();
        bot.needs.water -= Math.random() * 20;
        bot.needs.food -= Math.random() * 20;
        bot.needs.sleep -= Math.random() * 20;
        bot.lastNeedUpdate = new Date();
        console.log(`   💧 ${d.name} needs system enabled (randomized start)`);

        bots.set(bot.botId, bot);
      }
    } else {
      // Spawn bots from DB at random positions
      for (const agent of agents) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 8;
        const botColor = agent.color || random256Color();
        const bot: BotState = {
          botId: agent.id,
          botName: agent.name,
          personality: detectPersonality(agent.name),
          x: Math.cos(angle) * dist,
          y: 0,
          z: Math.sin(angle) * dist,
          targetX: Math.cos(angle) * dist, targetY: 0, targetZ: Math.sin(angle) * dist,
          state: 'idle',
          width: randomBotWidth(),
          height: randomBotHeight(),
          color: botColor,
          shape: randomBotShape(),
          inventory: { wood: 0, stone: 0, water: 0, food: 0 },
          needsPostTracker: createNeedsTracker(),
          path: [],
          pathIndex: 0,
          lifetimeStats: createLifetimeStats(agent),
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;

        // Persist color to DB if not already saved
        if (!agent.color) {
          prisma.agent
            .update({ where: { id: agent.id }, data: { color: botColor } })
            .then(() => console.log(`   🎨 ${agent.name} color saved: ${botColor}`))
            .catch((err: unknown) => console.error(`   ⚠️ Failed to save color for ${agent.name}:`, err));
        }

        bot.needs = initializeNeeds();
        bot.needs.water -= Math.random() * 20;
        bot.needs.food -= Math.random() * 20;
        bot.needs.sleep -= Math.random() * 20;
        bot.lastNeedUpdate = new Date();
        console.log(`   💧 ${agent.name} needs system enabled (randomized start)`);

        bots.set(bot.botId, bot);
      }
    }

    worldConfig.botCount = bots.size;
    const groundSide = Math.max(
      MIN_GROUND_SIZE,
      Math.sqrt(Math.max(1, bots.size) * SQ_METERS_PER_BOT)
    );
    worldConfig.groundRadius = Math.round(groundSide / 2);

    // Create randomized resource spots
    const innerRadius = 2.9;
    const outerRadius = worldConfig.groundRadius;

    const getRandomPos = (radius: number) => {
      const angle = Math.random() * Math.PI * 2;
      const maxDist = outerRadius - radius * 0.8;
      const minDist = innerRadius + radius * 1.0;
      const dist = minDist + Math.random() * (maxDist - minDist);
      return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist };
    };

    // 1. Water spot (lake)
    const waterPos = getRandomPos(3);
    worldConfig.waterSpots = [{ x: waterPos.x, z: waterPos.z, radius: 3 }];

    // 2. Food spot
    const foodPos = getRandomPos(1.5);
    worldConfig.foodSpots = [{ x: foodPos.x, z: foodPos.z, radius: 1.5 }];

    // 3. Wood spot (forest)
    const woodPos = getRandomPos(2.5);
    worldConfig.woodSpots = [{ x: woodPos.x, z: woodPos.z, radius: 2.5, available: 100 }];

    // 4. Stone spot (quarry)
    const stonePos = getRandomPos(2);
    worldConfig.stoneSpots = [{ x: stonePos.x, z: stonePos.z, radius: 2, available: 100 }];

    // Initialize empty shelters array
    worldConfig.shelters = [];

    // Load existing shelters from database
    const dbShelters = await prisma.shelter.findMany({ include: { owner: true } });
    for (const shelter of dbShelters) {
      const bot = bots.get(shelter.ownerId);
      worldConfig.shelters.push({
        id: shelter.id,
        type: shelter.type,
        x: shelter.x,
        z: shelter.z,
        ownerId: shelter.ownerId,
        ownerName: bot?.botName || shelter.owner.name,
        ownerColor: bot?.color || '#888888',
        built: shelter.built,
        buildProgress: shelter.buildProgress,
      });
    }
    console.log(`   🏠 Loaded ${dbShelters.length} shelters from database`);

    // Sundial in center
    worldConfig.sundial = { x: 0, z: 0, radius: 0.8 };

    console.log(`✅ Loaded ${bots.size} bots into simulation (ground: ${groundSide.toFixed(0)}×${groundSide.toFixed(0)}m)`);
    console.log(`   ☀️ Sundial at center (0, 0) radius: 0.8m`);
    console.log(`   💧 Water spot at (${worldConfig.waterSpots[0].x.toFixed(1)}, ${worldConfig.waterSpots[0].z.toFixed(1)}) radius: 3m`);
    console.log(`   🍎 Food spot at (${worldConfig.foodSpots[0].x.toFixed(1)}, ${worldConfig.foodSpots[0].z.toFixed(1)}) radius: 1.5m`);
    console.log(`   🌲 Wood spot at (${worldConfig.woodSpots[0].x.toFixed(1)}, ${worldConfig.woodSpots[0].z.toFixed(1)}) radius: 2.5m`);
    console.log(`   🪨 Stone spot at (${worldConfig.stoneSpots[0].x.toFixed(1)}, ${worldConfig.stoneSpots[0].z.toFixed(1)}) radius: 2m`);
    for (const bot of bots.values()) {
      console.log(`   🤖 ${bot.botName} (${bot.personality}) ${bot.color} ${bot.width.toFixed(2)}×${bot.height.toFixed(2)}m at (${bot.x.toFixed(1)}, ${bot.z.toFixed(1)})`);
    }
  } catch (error) {
    console.error('❌ Failed to load agents from DB:', error);
    console.log('   Continuing with demo bots...');
    // Fallback: spawn demo bots without DB
    const defaults = ['TechBot', 'PhilosopherBot', 'ArtBot', 'ScienceBot'];
    for (const name of defaults) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 8;
      const bot: BotState = {
        botId: `demo-${name}`,
        botName: name,
        personality: detectPersonality(name),
        x: Math.cos(angle) * dist,
        y: 0,
        z: Math.sin(angle) * dist,
        targetX: 0, targetY: 0, targetZ: 0,
        state: 'idle',
        width: randomBotWidth(),
        height: randomBotHeight(),
        color: random256Color(),
        shape: randomBotShape(),
        inventory: { wood: 0, stone: 0, water: 0, food: 0 },
        needsPostTracker: createNeedsTracker(),
        path: [],
        pathIndex: 0,
        lifetimeStats: createLifetimeStats(),
      };
      bot.targetX = bot.x;
      bot.targetZ = bot.z;
      bots.set(bot.botId, bot);
    }
    worldConfig.botCount = bots.size;
    worldConfig.groundRadius = Math.round(Math.sqrt(bots.size * SQ_METERS_PER_BOT) / 2);
  }

  // ─── Initialize AI Agents (Content Generation) ─────────────────
  if (ENABLE_AI_AGENTS) {
    console.log('');
    console.log('🤖 AI Agents: ENABLED');
    console.log('   Initializing content generation for bots with personality data...');

    agentInstances.clear();
    bridgeState.agentConnector = new PrismaConnector(prisma);

    const allEnabledAgents = await prisma.agent.findMany({ where: { enabled: true } });
    const agentsWithPersonality = allEnabledAgents.filter((a: Agent) => a.personality !== null);

    for (const agent of agentsWithPersonality) {
      try {
        const personality = agent.personality as unknown as Personality;
        if (!personality || !personality.name) {
          console.log(`   ⚠️ ${agent.name}: Invalid personality data, skipping AI`);
          continue;
        }

        const botAgent = new BotAgent(
          { name: agent.name, personality },
          bridgeState.agentConnector
        );

        agentInstances.set(agent.id, botAgent);
        console.log(`   ✅ ${agent.name}: AI agent ready (interval: ${personality.postFrequency || 60000}ms)`);
      } catch (error) {
        console.log(`   ❌ ${agent.name}: Failed to initialize AI agent: ${error}`);
      }
    }

    console.log(`   📊 ${agentInstances.size}/${bots.size} bots have AI content generation`);

    if (agentInstances.size > 0) {
      startAgentHeartbeats();
    }
  } else {
    console.log('');
    console.log('🤖 AI Agents: DISABLED (set ENABLE_AI_AGENTS=true to enable)');
  }
}
