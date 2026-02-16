// WebSocket Bridge — Drives the 3D simulation
// Loads bots from DB, simulates autonomous movement, broadcasts state to viewers
// Run alongside Next.js: npm run ws:bridge

import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

// ─── Types ───────────────────────────────────────────────────────

interface BotState {
  botId: string;
  botName: string;
  personality: string; // e.g. "tech", "philo", "art", "science"
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  state: 'idle' | 'wandering' | 'approaching' | 'speaking';
  lastPostTitle?: string;
  // Random appearance
  width: number;   // 0.5 – 0.8 meters
  height: number;  // 0.66 – 1.3 meters
  color: string;   // hex color from 256-color palette
}

interface WorldConfig {
  groundRadius: number;  // half-size of the ground plane
  botCount: number;
}

// ─── World State ─────────────────────────────────────────────────

const bots = new Map<string, BotState>();
const clients = new Set<WebSocket>();
let worldConfig: WorldConfig = { groundRadius: 15, botCount: 0 };
let lastPollTime = new Date();

// ─── Bot Movement Constants ──────────────────────────────────────

const MOVE_SPEED = 0.1;           // meters per tick (tiny steps, very frequent)
const WANDER_RADIUS = 5;         // max distance per wander decision (meters)
const TICK_INTERVAL = 200;        // ms between movement ticks (5x per second)
const POLL_INTERVAL = 5000;       // ms between DB polls
const IDLE_CHANCE = 0.1;          // 10% chance to pause — keeps movement continuous
const APPROACH_DISTANCE = 2;      // how close bots get when approaching (meters)
const SQ_METERS_PER_BOT = 75;    // each bot gets 75 m² of ground space
const MIN_GROUND_SIZE = 10;      // minimum ground size (side length) in meters
const BOT_MIN_WIDTH = 0.5;        // meters
const BOT_MAX_WIDTH = 0.8;
const BOT_MIN_HEIGHT = 0.66;      // meters
const BOT_MAX_HEIGHT = 1.3;

// ─── 256-Color Palette (Atari-style) ────────────────────────────

function random256Color(): string {
  // 216 web-safe colors (6×6×6 cube) + 40 grays = 256
  const r = Math.floor(Math.random() * 6) * 51; // 0,51,102,153,204,255
  const g = Math.floor(Math.random() * 6) * 51;
  const b = Math.floor(Math.random() * 6) * 51;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function randomBotWidth(): number {
  return BOT_MIN_WIDTH + Math.random() * (BOT_MAX_WIDTH - BOT_MIN_WIDTH);
}

function randomBotHeight(): number {
  return BOT_MIN_HEIGHT + Math.random() * (BOT_MAX_HEIGHT - BOT_MIN_HEIGHT);
}

// ─── Personality Detection ───────────────────────────────────────

function detectPersonality(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('tech')) return 'tech';
  if (lower.includes('philo')) return 'philo';
  if (lower.includes('art')) return 'art';
  if (lower.includes('science')) return 'science';
  // Fallback: hash the name to pick a type
  const types = ['tech', 'philo', 'art', 'science'];
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return types[hash % types.length];
}

// ─── Initialize Bots from Database ──────────────────────────────

async function initializeBots() {
  try {
    const agents = await prisma.agent.findMany({
      where: { enabled: true },
      select: { id: true, name: true, personality: true }
    });

    if (agents.length === 0) {
      console.log('⚠️  No enabled agents in DB. Spawning 4 default bots for demo...');
      // Create demo bots if DB is empty
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
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;
        bots.set(bot.botId, bot);
      }
    } else {
      // Spawn bots from DB at random positions
      for (const agent of agents) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 8;
        const bot: BotState = {
          botId: agent.id,
          botName: agent.name,
          personality: detectPersonality(agent.name),
          x: Math.cos(angle) * dist,
          y: 0,
          z: Math.sin(angle) * dist,
          targetX: 0, targetY: 0, targetZ: 0,
          state: 'idle',
          width: randomBotWidth(),
          height: randomBotHeight(),
          color: random256Color(),
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;
        bots.set(bot.botId, bot);
      }
    }

    worldConfig.botCount = bots.size;
    // Ground = square with area = botCount * SQ_METERS_PER_BOT
    // side = sqrt(area), halfSize = side / 2
    const groundSide = Math.max(
      MIN_GROUND_SIZE,
      Math.sqrt(Math.max(1, bots.size) * SQ_METERS_PER_BOT)
    );
    worldConfig.groundRadius = Math.round(groundSide / 2);

    console.log(`✅ Loaded ${bots.size} bots into simulation (ground: ${groundSide.toFixed(0)}×${groundSide.toFixed(0)}m)`);
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
      };
      bot.targetX = bot.x;
      bot.targetZ = bot.z;
      bots.set(bot.botId, bot);
    }
    worldConfig.botCount = bots.size;
    // Fallback ground size (side = sqrt(4 * 75) ≈ 17m)
    worldConfig.groundRadius = Math.round(Math.sqrt(bots.size * SQ_METERS_PER_BOT) / 2);
  }
}

// ─── Autonomous Movement Simulation ─────────────────────────────

function simulateMovement() {
  for (const bot of bots.values()) {
    // Move toward target
    const dx = bot.targetX - bot.x;
    const dz = bot.targetZ - bot.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.3) {
      // Move towards target
      const step = Math.min(MOVE_SPEED, dist);
      bot.x += (dx / dist) * step;
      bot.z += (dz / dist) * step;
      bot.state = 'wandering';
    } else {
      // Arrived at target
      bot.x = bot.targetX;
      bot.z = bot.targetZ;

      if (bot.state !== 'speaking') {
        bot.state = 'idle';
      }

      // Decide next action
      if (Math.random() > IDLE_CHANCE) {
        pickNewTarget(bot);
      }
    }
  }

  // ─── Collision Resolution ──────────────────────────────
  // Push overlapping bots apart based on their widths
  const botArray = Array.from(bots.values());
  for (let i = 0; i < botArray.length; i++) {
    for (let j = i + 1; j < botArray.length; j++) {
      const a = botArray[i];
      const b = botArray[j];

      const cdx = b.x - a.x;
      const cdz = b.z - a.z;
      const centerDist = Math.sqrt(cdx * cdx + cdz * cdz);

      // Minimum separation = sum of half-widths + small buffer
      const minSep = (a.width + b.width) / 2 + 0.1;

      if (centerDist < minSep && centerDist > 0.001) {
        // Push apart equally along the collision axis
        const overlap = minSep - centerDist;
        const pushX = (cdx / centerDist) * overlap * 0.5;
        const pushZ = (cdz / centerDist) * overlap * 0.5;

        a.x -= pushX;
        a.z -= pushZ;
        b.x += pushX;
        b.z += pushZ;

        // Also redirect their targets away from each other
        if (a.state === 'wandering') pickNewTarget(a);
        if (b.state === 'wandering') pickNewTarget(b);
      }
    }
  }

  // Broadcast all positions
  broadcastBotPositions();
}

function pickNewTarget(bot: BotState) {
  const radius = worldConfig.groundRadius - 2; // Stay within bounds

  // 30% chance: approach another bot
  if (Math.random() < 0.3) {
    const otherBots = Array.from(bots.values()).filter(b => b.botId !== bot.botId);
    if (otherBots.length > 0) {
      const target = otherBots[Math.floor(Math.random() * otherBots.length)];
      const angle = Math.atan2(bot.z - target.z, bot.x - target.x);
      bot.targetX = target.x + Math.cos(angle) * APPROACH_DISTANCE;
      bot.targetZ = target.z + Math.sin(angle) * APPROACH_DISTANCE;
      bot.state = 'approaching';
      return;
    }
  }

  // Otherwise: wander randomly
  const angle = Math.random() * Math.PI * 2;
  const wanderDist = 2 + Math.random() * WANDER_RADIUS;
  bot.targetX = bot.x + Math.cos(angle) * wanderDist;
  bot.targetZ = bot.z + Math.sin(angle) * wanderDist;

  // Clamp to world bounds
  const clampDist = Math.sqrt(bot.targetX * bot.targetX + bot.targetZ * bot.targetZ);
  if (clampDist > radius) {
    bot.targetX = (bot.targetX / clampDist) * radius;
    bot.targetZ = (bot.targetZ / clampDist) * radius;
  }

  bot.state = 'wandering';
}

// ─── Database Polling (detect new posts) ─────────────────────────

async function pollForNewPosts() {
  try {
    const recentPosts = await prisma.post.findMany({
      where: { createdAt: { gte: lastPollTime } },
      include: { agent: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    lastPollTime = new Date();

    for (const post of recentPosts) {
      const bot = bots.get(post.agent.id);
      if (bot) {
        bot.state = 'speaking';
        bot.lastPostTitle = post.title;

        broadcast({
          type: 'bot:speak',
          data: {
            postId: post.id,
            botId: bot.botId,
            botName: bot.botName,
            title: post.title,
            content: post.content,
            x: bot.x,
            y: bot.y,
            z: bot.z,
          }
        });

        // Return to idle after 5 seconds
        setTimeout(() => {
          if (bot.state === 'speaking') {
            bot.state = 'idle';
          }
        }, 5000);
      }
    }
  } catch {
    // DB might not be available, that's ok
  }
}

// ─── Broadcasting ────────────────────────────────────────────────

function broadcast(message: any) {
  const msg = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function broadcastBotPositions() {
  const positions = Array.from(bots.values()).map(b => ({
    botId: b.botId,
    botName: b.botName,
    personality: b.personality,
    x: b.x,
    y: b.y,
    z: b.z,
    state: b.state,
    lastPostTitle: b.lastPostTitle,
    width: b.width,
    height: b.height,
    color: b.color,
  }));

  broadcast({
    type: 'world:update',
    data: { bots: positions, worldConfig }
  });
}

function sendWorldInit(ws: WebSocket) {
  const botsArray = Array.from(bots.values()).map(b => ({
    botId: b.botId,
    botName: b.botName,
    personality: b.personality,
    x: b.x,
    y: b.y,
    z: b.z,
    state: b.state,
    lastPostTitle: b.lastPostTitle,
    width: b.width,
    height: b.height,
    color: b.color,
  }));

  ws.send(JSON.stringify({
    type: 'world:init',
    data: { bots: botsArray, worldConfig }
  }));
}

// ─── WebSocket Server ────────────────────────────────────────────

wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 Viewer connected');
  clients.add(ws);

  // Send current world state
  sendWorldInit(ws);

  ws.on('message', (message: string) => {
    try {
      const msg = JSON.parse(message.toString());
      switch (msg.type) {
        case 'camera:focus':
          console.log(`📹 Camera focused on ${msg.data.botName || msg.data.botId}`);
          break;
        default:
          break;
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log('🔌 Viewer disconnected');
    clients.delete(ws);
  });
});

// ─── Start Everything ────────────────────────────────────────────

async function start() {
  console.log('');
  console.log('🌍 Bot-Talker WebSocket Bridge');
  console.log('───────────────────────────────');

  await initializeBots();

  // Start movement simulation
  setInterval(simulateMovement, TICK_INTERVAL);

  // Start DB polling for new posts
  setInterval(pollForNewPosts, POLL_INTERVAL);

  console.log('');
  console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`   Movement tick: every ${TICK_INTERVAL}ms`);
  console.log(`   DB poll: every ${POLL_INTERVAL}ms`);
  console.log('   Open http://localhost:3000/simulation to view');
  console.log('');
}

start().catch(console.error);
