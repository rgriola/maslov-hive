// WebSocket Bridge — Drives the 3D simulation
// Loads bots from DB, simulates autonomous movement, broadcasts state to viewers
// Run alongside Next.js: npm run ws:bridge

import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';
import {
  PhysicalNeeds,
  initializeNeeds,
  decayNeeds,
  fulfillNeed,
  getMostUrgentNeed,
  getNeedEmoji,
  isInCriticalCondition,
  NEED_THRESHOLDS
} from './bot-needs';
import { BotState, WorldConfig, ShelterData } from '@/types/simulation';
import { WORLD_CONFIG, BOT_PHYSICS } from '@/config/simulation';
import { findPath } from '@/lib/pathfinding';
import {
  random256Color,
  randomBotWidth,
  randomBotHeight,
  randomBotShape,
  detectPersonality,
  isWalkable
} from '@/lib/world-physics';

const prisma = new PrismaClient();
const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

// ─── Types ───────────────────────────────────────────────────────





// ─── World State ─────────────────────────────────────────────────

const bots = new Map<string, BotState>();
const clients = new Set<WebSocket>();
const pardonCooldowns = new Map<string, number>(); // pairKey → last pardon timestamp
const greetingTimestamps = new Map<string, number[]>(); // botId → timestamps of greeting posts
let worldConfig: WorldConfig = {
  groundRadius: 15,
  botCount: 0,
  waterSpots: [], // Initialize empty, will add water spot during init
  foodSpots: [],   // Initialize empty, will add food spot during init
  woodSpots: [],   // Wood resource locations
  stoneSpots: [],  // Stone resource locations
  shelters: [],    // Bot shelter locations
  sundial: { x: 0, z: 0, radius: 0.8 } // Community sundial in center (smaller for easier navigation)
};
let lastPollTime = new Date();

// ─── Bot Movement Constants ──────────────────────────────────────

const MOVE_SPEED = 0.1;           // meters per tick (tiny steps, very frequent)
const WANDER_RADIUS = 5;         // max distance per wander decision (meters)
const TICK_INTERVAL = 200;        // ms between movement ticks (5x per second)
const POLL_INTERVAL = 5000;       // ms between DB polls
// Cooldowns to prevent spamming
const sharingCooldowns = new Map<string, number>(); // key: "giver-receiver", value: timestamp

// Shared constants mapped from config
const IDLE_CHANCE = BOT_PHYSICS.IDLE_CHANCE;
const APPROACH_DISTANCE = WORLD_CONFIG.APPROACH_DISTANCE;
const SQ_METERS_PER_BOT = WORLD_CONFIG.SQ_METERS_PER_BOT;
const MIN_GROUND_SIZE = WORLD_CONFIG.MIN_GROUND_SIZE;
const BOT_MIN_WIDTH = BOT_PHYSICS.MIN_WIDTH;
const BOT_MAX_WIDTH = BOT_PHYSICS.MAX_WIDTH;
const BOT_MIN_HEIGHT = BOT_PHYSICS.MIN_HEIGHT;
const BOT_MAX_HEIGHT = BOT_PHYSICS.MAX_HEIGHT;
const NAV_GRID_CELL_SIZE = WORLD_CONFIG.NAV_GRID_CELL_SIZE;

// Helper functions removed: isWalkable, findPath, simplifyPath, random*, detectPersonality
// Now imported from src/lib/

// ─── Weather State (for homeostasis) ────────────────────────────
let currentTemperature: number = 20; // Default moderate temp (°C)

async function fetchWorldTemperature() {
  try {
    const lat = process.env.BOT_LATITUDE || '40.71';
    const lon = process.env.BOT_LONGITUDE || '-74.01';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const res = await fetch(url);
    const data = await res.json();
    currentTemperature = data.current_weather?.temperature ?? 20;
    console.log(`🌡️ World temperature: ${currentTemperature}°C`);
  } catch (err) {
    console.error('⚠️ Failed to fetch weather for homeostasis:', err);
  }
}

// Refresh weather every 15 minutes
setInterval(fetchWorldTemperature, 15 * 60 * 1000);

/** Get homeostasis decay multiplier based on temperature */
function getTemperatureModifier(): number {
  if (currentTemperature > 35 || currentTemperature < 0) return 3.0;  // Extreme
  if (currentTemperature > 30 || currentTemperature < 5) return 2.0;  // Hot/cold
  return 1.0; // Moderate
}

/** Create a full needs post tracker for all need types */
function createNeedsTracker() {
  const t = { seeking: false, critical: false, zero: false };
  return {
    water: { ...t },
    food: { ...t },
    sleep: { ...t },
    air: { ...t },
    clothing: { ...t },
    homeostasis: { ...t },
    reproduction: { ...t },
  };
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
          shape: randomBotShape(),
          inventory: { wood: 0, stone: 0, water: 0, food: 0 },
          needsPostTracker: createNeedsTracker(),
          path: [],
          pathIndex: 0,
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;

        // Enable needs for all demo bots
        bot.needs = initializeNeeds();
        bot.lastNeedUpdate = new Date();
        console.log(`   💧 ${d.name} needs system enabled`);

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
          shape: randomBotShape(),
          inventory: { wood: 0, stone: 0, water: 0, food: 0 },
          needsPostTracker: createNeedsTracker(),
          path: [],
          pathIndex: 0,
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;

        // Enable needs for all bots
        bot.needs = initializeNeeds();
        bot.lastNeedUpdate = new Date();
        console.log(`   💧 ${agent.name} needs system enabled`);

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

    // Create water spot (lake) - place it off to one side
    const waterX = worldConfig.groundRadius * 0.6; // 60% to the right
    const waterZ = worldConfig.groundRadius * 0.3; // 30% forward
    worldConfig.waterSpots = [
      { x: waterX, z: waterZ, radius: 3 } // 3-meter radius lake
    ];

    // Create food spot (smaller than water) - place it opposite side
    const foodX = -worldConfig.groundRadius * 0.5; // 50% to the left
    const foodZ = worldConfig.groundRadius * 0.4;  // 40% forward
    worldConfig.foodSpots = [
      { x: foodX, z: foodZ, radius: 1.5 } // 1.5-meter radius food patch
    ];

    // Create wood spot (forest) - trees for building materials
    const woodX = worldConfig.groundRadius * 0.3;  // 30% to the right
    const woodZ = -worldConfig.groundRadius * 0.5; // 50% back
    worldConfig.woodSpots = [
      { x: woodX, z: woodZ, radius: 2.5, available: 100 } // Forest with wood
    ];

    // Create stone spot (quarry) - rocks for building materials
    const stoneX = -worldConfig.groundRadius * 0.4; // 40% to the left
    const stoneZ = -worldConfig.groundRadius * 0.4; // 40% back
    worldConfig.stoneSpots = [
      { x: stoneX, z: stoneZ, radius: 2, available: 100 } // Quarry with stone
    ];

    // Initialize empty shelters array
    worldConfig.shelters = [];

    // Load existing shelters from database
    const dbShelters = await prisma.shelter.findMany();
    for (const shelter of dbShelters) {
      worldConfig.shelters.push({
        id: shelter.id,
        type: shelter.type,
        x: shelter.x,
        z: shelter.z,
        ownerId: shelter.ownerId,
        built: shelter.built,
        buildProgress: shelter.buildProgress,
      });
    }
    console.log(`   🏠 Loaded ${dbShelters.length} shelters from database`);

    // Place sundial in the center of town (communal gathering point)
    worldConfig.sundial = { x: 0, z: 0, radius: 0.8 };

    console.log(`✅ Loaded ${bots.size} bots into simulation (ground: ${groundSide.toFixed(0)}×${groundSide.toFixed(0)}m)`);
    console.log(`   ☀️ Sundial at center (0, 0) radius: 0.8m`);
    console.log(`   💧 Water spot at (${waterX.toFixed(1)}, ${waterZ.toFixed(1)}) radius: 3m`);
    console.log(`   🍎 Food spot at (${foodX.toFixed(1)}, ${foodZ.toFixed(1)}) radius: 1.5m`);
    console.log(`   🌲 Wood spot at (${woodX.toFixed(1)}, ${woodZ.toFixed(1)}) radius: 2.5m`);
    console.log(`   🪨 Stone spot at (${stoneX.toFixed(1)}, ${stoneZ.toFixed(1)}) radius: 2m`);
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
  // ─── Update Physical Needs ─────────────────────────────────
  const now = new Date();
  for (const bot of bots.values()) {
    if (!bot.needs || !bot.lastNeedUpdate) continue;

    // Calculate elapsed time in minutes
    const elapsedMs = now.getTime() - bot.lastNeedUpdate.getTime();
    const elapsedMinutes = elapsedMs / (1000 * 60);

    // Decay needs
    if (elapsedMinutes > 0.01) { // Update if at least ~0.6 seconds passed
      // Apply homeostasis weather modifier
      const tempMod = getTemperatureModifier();
      bot.needs = decayNeeds(bot.needs, elapsedMinutes, {
        homeostasis: 5 * tempMod,
      });
      bot.lastNeedUpdate = now;

      // ─── Air: passive breathing (auto-restore) ─────────────
      // Air decays via decayNeeds, but restores passively every tick
      bot.needs = fulfillNeed(bot.needs, 'air', 40 * elapsedMinutes);

      // ─── Homeostasis: accelerate decay when other needs critical ──
      if (isInCriticalCondition(bot.needs)) {
        bot.needs.homeostasis = Math.max(0, bot.needs.homeostasis - 2 * elapsedMinutes);
      }
      // Homeostasis passively restores when in shelter and other needs OK
      if (bot.state === 'sleeping' && !isInCriticalCondition(bot.needs)) {
        bot.needs = fulfillNeed(bot.needs, 'homeostasis', 8 * elapsedMinutes);
      }

      // ─── Clothing: decays faster in harsh weather
      if (currentTemperature < 10 || currentTemperature > 30) {
        bot.needs.clothing = Math.max(0, bot.needs.clothing - 0.5 * elapsedMinutes);
      }

      // Reproduction decays via decayNeeds; restored by coupling behavior below

      // Check if bot needs water
      const urgentNeed = getMostUrgentNeed(bot.needs);

      // ─── Critical Distress Alerts (20% Threshold) ─────────────
      if (bot.needs.water < 20) broadcastNeedsPost(bot, 'critical-water');
      if (bot.needs.food < 20) broadcastNeedsPost(bot, 'critical-food');
      if (bot.needs.sleep < 20) broadcastNeedsPost(bot, 'critical-sleep');

      // ─── Status & Busy Check ──────────────────────────────────
      const isSelfInDistress = isInCriticalCondition(bot.needs);
      const globalBusyStates = [
        'drinking', 'eating', 'building-shelter', 'sleeping',
        'seeking-to-help', 'seeking-partner', 'coupling'
      ];

      // ─── Hero System: Proactively seek out needy neighbors ───
      // Only help if healthy, having inventory, and not already busy
      const canHelp = !isSelfInDistress && (bot.inventory.water > 0 || bot.inventory.food > 0) && ['idle', 'thinking', 'walking', 'wandering'].includes(bot.state);

      if (canHelp) {
        for (const neighbor of bots.values()) {
          if (neighbor.botId === bot.botId) continue;
          if (neighbor.state === 'seeking-to-help' || neighbor.state === 'sleeping' || neighbor.state === 'coupling') continue;

          const dist = Math.sqrt(Math.pow(bot.x - neighbor.x, 2) + Math.pow(bot.z - neighbor.z, 2));
          // Search for neighbors who actually NEED help (water or food)
          if (neighbor.needs && (neighbor.needs.water < 20 || neighbor.needs.food < 20)) {
            const cooldownKey = `${bot.botId}-${neighbor.botId}-hero`;
            const lastHeroAction = sharingCooldowns.get(cooldownKey) || 0;
            const nowTime = Date.now();

            if (nowTime - lastHeroAction > 30000) { // 30s hero cooldown
              if (Math.random() < 0.5) { // 50% chance to be a hero
                bot.state = 'seeking-to-help';
                bot.helpingTargetId = neighbor.botId;
                bot.targetX = neighbor.x;
                bot.targetZ = neighbor.z;
                bot.path = [];
                bot.pathIndex = 0;
                broadcastNeedsPost(bot, 'coming-to-help');
                console.log(`🦸 ${bot.botName} is going to help ${neighbor.botName}!`);
                sharingCooldowns.set(cooldownKey, nowTime + 60000); // Set success cooldown
                break; // One mission at a time
              } else {
                sharingCooldowns.set(cooldownKey, nowTime);
              }
            }
          }
        }
      }

      // Check if bot needs water (only if not busy)
      if (urgentNeed.need === 'water' && !globalBusyStates.includes(bot.state) && bot.state !== 'seeking-water') {
        // Survival Check: Do we have water in inventory?
        if (bot.needs.water < 20 && bot.inventory.water > 0) {
          bot.inventory.water--;
          bot.needs = fulfillNeed(bot.needs, 'water', 10); // Restore 10% per item
          console.log(`🍶 ${bot.botName} drank from canteen! (Water: ${bot.needs.water.toFixed(1)}, Inv: ${bot.inventory.water})`);
          // Don't seek water yet
        } else {
          // Bot needs water! Find nearest water spot
          const nearestWater = worldConfig.waterSpots[0];
          if (nearestWater) {
            bot.targetX = nearestWater.x;
            bot.targetZ = nearestWater.z;
            bot.path = []; // Clear path for A* recompute
            bot.pathIndex = 0;
            bot.state = 'seeking-water';
            broadcastNeedsPost(bot, 'seeking-water');
            console.log(`💧 ${bot.botName} is thirsty (water: ${bot.needs.water.toFixed(1)}) - seeking water at (${nearestWater.x.toFixed(1)}, ${nearestWater.z.toFixed(1)})`);
          }
        }
      }

      // Check if bot reached water
      if (bot.state === 'seeking-water' && worldConfig.waterSpots.length > 0) {
        const water = worldConfig.waterSpots[0];
        const distToWater = Math.sqrt(
          Math.pow(bot.x - water.x, 2) + Math.pow(bot.z - water.z, 2)
        );

        if (distToWater < water.radius) {
          // Bot is at water! Start drinking
          bot.state = 'drinking';
          broadcastNeedsPost(bot, 'drinking');
          console.log(`🍶 ${bot.botName} is drinking! Hydrating over 20s...`);

          // Drink for 20 seconds, gradually restoring water
          // Drink until needs full AND inventory full (or timeout)
          let drinkTicks = 0;
          const maxTicks = 60;
          const drinkInterval = setInterval(() => {
            drinkTicks++;
            if (bot.needs) {
              if (bot.needs.water < 100) {
                bot.needs = fulfillNeed(bot.needs, 'water', 5); // Restore needs first
              } else if (bot.inventory.water < 5) {
                // Needs full, fill inventory (1 item every 2s)
                if (drinkTicks % 2 === 0) {
                  bot.inventory.water++;
                  console.log(`🍶 ${bot.botName} collected water +1 (Inv: ${bot.inventory.water})`);
                }
              }
            }

            const isNeedsFull = (bot.needs?.water || 0) >= 100;
            const isInvFull = bot.inventory.water >= 5;

            if ((isNeedsFull && isInvFull) || drinkTicks >= maxTicks) {
              clearInterval(drinkInterval);
              if (bot.state === 'drinking') {
                if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'water', 100);
                bot.state = 'idle';
                broadcastNeedsPost(bot, 'finished-drinking');
                console.log(`✅ ${bot.botName} finished drinking (Water: ${bot.needs?.water.toFixed(1)}, Inv: ${bot.inventory.water})`);
              }
            }
          }, 1000);
        }
      }

      // Check if bot needs food (only if not already busy)
      if (urgentNeed.need === 'food' && !globalBusyStates.includes(bot.state) && bot.state !== 'seeking-food') {
        // Survival Check: Do we have food in inventory?
        if (bot.needs.food < 15 && bot.inventory.food > 0) {
          bot.inventory.food--;
          bot.needs = fulfillNeed(bot.needs, 'food', 10); // Restore 10% per item
          console.log(`🍎 ${bot.botName} ate a snack! (Food: ${bot.needs.food.toFixed(1)}, Inv: ${bot.inventory.food})`);
          // Don't seek food yet
        } else {
          // Bot needs food! Find nearest food spot
          const nearestFood = worldConfig.foodSpots[0];
          if (nearestFood) {
            bot.targetX = nearestFood.x;
            bot.targetZ = nearestFood.z;
            bot.path = []; // Clear path for A* recompute
            bot.pathIndex = 0;
            bot.state = 'seeking-food';
            broadcastNeedsPost(bot, 'seeking-food');
            console.log(`🍎 ${bot.botName} is hungry (food: ${bot.needs.food.toFixed(1)}) - seeking food at (${nearestFood.x.toFixed(1)}, ${nearestFood.z.toFixed(1)})`);
          }
        }
      }

      // Check if bot reached food
      if (bot.state === 'seeking-food' && worldConfig.foodSpots.length > 0) {
        const food = worldConfig.foodSpots[0];
        const distToFood = Math.sqrt(
          Math.pow(bot.x - food.x, 2) + Math.pow(bot.z - food.z, 2)
        );

        if (distToFood < food.radius) {
          // Bot is at food! Start eating
          bot.state = 'eating';
          broadcastNeedsPost(bot, 'eating');
          console.log(`🍴 ${bot.botName} is eating! Filling up over 20s...`);

          // Eat for 20 seconds, gradually restoring food
          // Eat until needs full AND inventory full (or timeout)
          let eatTicks = 0;
          const maxTicks = 60;
          const eatInterval = setInterval(() => {
            eatTicks++;
            if (bot.needs) {
              if (bot.needs.food < 100) {
                bot.needs = fulfillNeed(bot.needs, 'food', 5);
              } else if (bot.inventory.food < 3) {
                // Needs full, fill inventory (1 item every 2s)
                if (eatTicks % 2 === 0) {
                  bot.inventory.food++;
                  console.log(`🍎 ${bot.botName} collected food +1 (Inv: ${bot.inventory.food})`);
                }
              }
            }

            const isNeedsFull = (bot.needs?.food || 0) >= 100;
            const isInvFull = bot.inventory.food >= 3;

            if ((isNeedsFull && isInvFull) || eatTicks >= maxTicks) {
              clearInterval(eatInterval);
              if (bot.state === 'eating') {
                if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'food', 100);
                bot.state = 'idle';
                broadcastNeedsPost(bot, 'finished-eating');
                console.log(`✅ ${bot.botName} finished eating (Food: ${bot.needs?.food.toFixed(1)}, Inv: ${bot.inventory.food})`);
              }
            }
          }, 1000);
        }
      }

      // ─── Sleep & Shelter System ─────────────────────────────
      const WOOD_REQUIRED = 5;
      const STONE_REQUIRED = 3;

      // Check if bot needs sleep (only if not busy)
      if (urgentNeed.need === 'sleep' && !globalBusyStates.includes(bot.state) && !['seeking-shelter', 'gathering-wood', 'gathering-stone'].includes(bot.state)) {
        // Check if bot has a shelter
        const ownShelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && s.built);

        if (ownShelter) {
          // Go to shelter to sleep
          bot.targetX = ownShelter.x;
          bot.targetZ = ownShelter.z;
          bot.path = []; // Clear path for A* recompute
          bot.pathIndex = 0;
          bot.state = 'seeking-shelter';
          broadcastNeedsPost(bot, 'seeking-shelter');
          console.log(`😴 ${bot.botName} is tired (sleep: ${bot.needs.sleep.toFixed(1)}) - heading to shelter`);
        } else {
          // Need to build a shelter first - check if bot already has one (built or in progress)
          const existingShelter = worldConfig.shelters.find(s => s.ownerId === bot.botId);

          if (existingShelter && !existingShelter.built) {
            // Already building - go to the build site
            bot.targetX = existingShelter.x;
            bot.targetZ = existingShelter.z;
            bot.path = []; // Clear path for A* recompute
            bot.pathIndex = 0;
            bot.state = 'building-shelter';
            console.log(`🔨 ${bot.botName} resuming shelter construction`);
          } else if (!existingShelter && bot.inventory.wood >= WOOD_REQUIRED && bot.inventory.stone >= STONE_REQUIRED) {
            // Has resources and no shelter - find a valid spot to build
            const findValidBuildSpot = (): { x: number; z: number } | null => {
              // Define settlement area (center of the map)
              const settlementCenterX = 0;
              const settlementCenterZ = 0;

              // Try to find a spot that doesn't overlap any resources
              for (let attempt = 0; attempt < 50; attempt++) {
                // Random position in larger settlement area (center of map)
                const candidateX = settlementCenterX + (Math.random() - 0.5) * 12;
                const candidateZ = settlementCenterZ + (Math.random() - 0.5) * 12;

                // Check distance from all resource spots
                let isValid = true;
                const minDistance = 2; // Must be at least 2 meters from any resource

                // Check water spots
                for (const water of worldConfig.waterSpots) {
                  const dist = Math.sqrt(Math.pow(candidateX - water.x, 2) + Math.pow(candidateZ - water.z, 2));
                  if (dist < water.radius + minDistance) {
                    isValid = false;
                    break;
                  }
                }

                // Check food spots
                if (isValid) {
                  for (const food of worldConfig.foodSpots) {
                    const dist = Math.sqrt(Math.pow(candidateX - food.x, 2) + Math.pow(candidateZ - food.z, 2));
                    if (dist < food.radius + minDistance) {
                      isValid = false;
                      break;
                    }
                  }
                }

                // Check wood spots
                if (isValid) {
                  for (const wood of worldConfig.woodSpots) {
                    const dist = Math.sqrt(Math.pow(candidateX - wood.x, 2) + Math.pow(candidateZ - wood.z, 2));
                    if (dist < wood.radius + minDistance) {
                      isValid = false;
                      break;
                    }
                  }
                }

                // Check stone spots
                if (isValid) {
                  for (const stone of worldConfig.stoneSpots) {
                    const dist = Math.sqrt(Math.pow(candidateX - stone.x, 2) + Math.pow(candidateZ - stone.z, 2));
                    if (dist < stone.radius + minDistance) {
                      isValid = false;
                      break;
                    }
                  }
                }

                // Check other shelters - allow very close placement (1.2m for 1m shelters)
                if (isValid) {
                  for (const shelter of worldConfig.shelters) {
                    const dist = Math.sqrt(Math.pow(candidateX - shelter.x, 2) + Math.pow(candidateZ - shelter.z, 2));
                    if (dist < 1.2) { // Shelters can be neighbors, just no overlap
                      isValid = false;
                      break;
                    }
                  }
                }

                // Check Sundial (Social Core) - must never build on it
                if (isValid && worldConfig.sundial) {
                  const distToSundial = Math.sqrt(
                    Math.pow(candidateX - worldConfig.sundial.x, 2) +
                    Math.pow(candidateZ - worldConfig.sundial.z, 2)
                  );
                  if (distToSundial < worldConfig.sundial.radius + 2.0) {
                    isValid = false;
                  }
                }

                // Clamp to world bounds
                const clampedX = Math.max(-worldConfig.groundRadius + 0.5, Math.min(worldConfig.groundRadius - 0.5, candidateX));
                const clampedZ = Math.max(-worldConfig.groundRadius + 0.5, Math.min(worldConfig.groundRadius - 0.5, candidateZ));

                if (isValid) {
                  return { x: clampedX, z: clampedZ };
                }
              }

              return null; // Couldn't find valid spot
            };

            const buildSpot = findValidBuildSpot();

            if (buildSpot) {
              // Create shelter in memory first with temporary ID
              const tempId = `shelter-${bot.botId}-${Date.now()}`;
              const newShelter = {
                id: tempId,
                type: 'hut',
                x: buildSpot.x,
                z: buildSpot.z,
                ownerId: bot.botId,
                built: false,
                buildProgress: 0
              };
              worldConfig.shelters.push(newShelter);
              bot.shelterId = newShelter.id;

              // Save to database asynchronously
              prisma.shelter.create({
                data: {
                  type: 'hut',
                  x: buildSpot.x,
                  z: buildSpot.z,
                  ownerId: bot.botId,
                  built: false,
                  buildProgress: 0,
                }
              }).then(dbShelter => {
                // Update in-memory shelter with real DB ID
                newShelter.id = dbShelter.id;
                bot.shelterId = dbShelter.id;
                console.log(`💾 Shelter saved to DB: ${dbShelter.id}`);
              }).catch(err => {
                console.error('Failed to save shelter to DB:', err);
              });

              // Go to build site
              bot.targetX = buildSpot.x;
              bot.targetZ = buildSpot.z;
              bot.path = []; // Clear path for A* recompute
              bot.pathIndex = 0;
              bot.state = 'building-shelter';
              broadcastNeedsPost(bot, 'building-shelter');
              console.log(`🔨 ${bot.botName} is going to build a shelter at (${buildSpot.x.toFixed(1)}, ${buildSpot.z.toFixed(1)})`);
            } else {
              console.log(`⚠️ ${bot.botName} couldn't find a valid spot to build shelter`);
            }
          } else if (bot.inventory.wood < WOOD_REQUIRED) {
            // Need more wood
            const nearestWood = worldConfig.woodSpots[0];
            if (nearestWood) {
              bot.targetX = nearestWood.x;
              bot.targetZ = nearestWood.z;
              bot.path = []; // Clear path for A* recompute
              bot.pathIndex = 0;
              bot.state = 'gathering-wood';
              broadcastNeedsPost(bot, 'gathering-wood');
              console.log(`🪓 ${bot.botName} needs wood (${bot.inventory.wood}/${WOOD_REQUIRED}) - heading to forest`);
            }
          } else if (bot.inventory.stone < STONE_REQUIRED) {
            // Need more stone
            const nearestStone = worldConfig.stoneSpots[0];
            if (nearestStone) {
              bot.targetX = nearestStone.x;
              bot.targetZ = nearestStone.z;
              bot.path = []; // Clear path for A* recompute
              bot.pathIndex = 0;
              bot.state = 'gathering-stone';
              broadcastNeedsPost(bot, 'gathering-stone');
              console.log(`⛏️ ${bot.botName} needs stone (${bot.inventory.stone}/${STONE_REQUIRED}) - heading to quarry`);
            }
          }
        }
      }

      // Check if bot reached wood spot
      if (bot.state === 'gathering-wood' && worldConfig.woodSpots.length > 0) {
        const wood = worldConfig.woodSpots[0];
        const distToWood = Math.sqrt(
          Math.pow(bot.x - wood.x, 2) + Math.pow(bot.z - wood.z, 2)
        );

        if (distToWood < wood.radius && wood.available > 0) {
          // Gather wood
          bot.inventory.wood += 1;
          wood.available -= 1;
          console.log(`🪵 ${bot.botName} gathered wood (${bot.inventory.wood}/${WOOD_REQUIRED})`);

          if (bot.inventory.wood >= WOOD_REQUIRED) {
            bot.state = 'idle';
            console.log(`✅ ${bot.botName} has enough wood!`);
          } else {
            // Keep gathering
            setTimeout(() => {
              if (bot.state === 'gathering-wood') {
                bot.state = 'idle'; // Will re-trigger gathering on next tick
              }
            }, 1000);
          }
        }
      }

      // Check if bot reached stone spot
      if (bot.state === 'gathering-stone' && worldConfig.stoneSpots.length > 0) {
        const stone = worldConfig.stoneSpots[0];
        const distToStone = Math.sqrt(
          Math.pow(bot.x - stone.x, 2) + Math.pow(bot.z - stone.z, 2)
        );

        if (distToStone < stone.radius && stone.available > 0) {
          // Gather stone
          bot.inventory.stone += 1;
          stone.available -= 1;
          console.log(`🪨 ${bot.botName} gathered stone (${bot.inventory.stone}/${STONE_REQUIRED})`);

          if (bot.inventory.stone >= STONE_REQUIRED) {
            bot.state = 'idle';
            console.log(`✅ ${bot.botName} has enough stone!`);
          } else {
            // Keep gathering
            setTimeout(() => {
              if (bot.state === 'gathering-stone') {
                bot.state = 'idle'; // Will re-trigger gathering on next tick
              }
            }, 1000);
          }
        }
      }

      // Check if bot reached build site
      if (bot.state === 'building-shelter') {
        const shelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && !s.built);
        if (shelter) {
          const distToSite = Math.sqrt(
            Math.pow(bot.x - shelter.x, 2) + Math.pow(bot.z - shelter.z, 2)
          );

          if (distToSite < 1.5) {
            // At build site - start building
            shelter.buildProgress += 10;
            console.log(`🔨 ${bot.botName} is building... (${shelter.buildProgress}%)`);

            // Update progress in database
            prisma.shelter.update({
              where: { id: shelter.id },
              data: { buildProgress: shelter.buildProgress }
            }).catch(err => console.error('Failed to update shelter progress:', err));

            if (shelter.buildProgress >= 100) {
              // Shelter complete!
              shelter.built = true;
              bot.inventory.wood -= WOOD_REQUIRED;
              bot.inventory.stone -= STONE_REQUIRED;
              bot.state = 'idle';
              broadcastNeedsPost(bot, 'finished-building');
              console.log(`🏠 ${bot.botName} finished building shelter!`);

              // Mark shelter as built in database
              prisma.shelter.update({
                where: { id: shelter.id },
                data: { built: true, buildProgress: 100 }
              }).catch(err => console.error('Failed to mark shelter as built:', err));
            } else {
              // Keep building
              setTimeout(() => {
                if (bot.state === 'building-shelter') {
                  bot.state = 'idle'; // Will re-trigger building on next tick
                }
              }, 800);
            }
          }
        }
      }

      // Check if bot reached shelter to sleep
      if (bot.state === 'seeking-shelter') {
        const shelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && s.built);
        if (shelter) {
          const distToShelter = Math.sqrt(
            Math.pow(bot.x - shelter.x, 2) + Math.pow(bot.z - shelter.z, 2)
          );

          if (distToShelter < 1.5) {
            // At shelter - start sleeping
            bot.state = 'sleeping';
            broadcastNeedsPost(bot, 'sleeping');
            console.log(`💤 ${bot.botName} is sleeping in shelter...`);

            // Sleep for 1 minute, gradually restoring sleep need
            let sleepTicks = 0;
            const sleepInterval = setInterval(() => {
              // Airplane Rule & General State Guard: Stop sleeping if state changed
              if (bot.state !== 'sleeping') {
                clearInterval(sleepInterval);
                return;
              }

              sleepTicks++;
              if (bot.needs) {
                bot.needs = fulfillNeed(bot.needs, 'sleep', 1.7); // ~100 over 60s
                bot.needs = fulfillNeed(bot.needs, 'shelter', 1); // Also restore shelter need
                bot.needs = fulfillNeed(bot.needs, 'clothing', 0.5); // Also restore clothing
                bot.needs = fulfillNeed(bot.needs, 'homeostasis', 0.3); // Shelter helps homeostasis
              }

              if (sleepTicks >= 60) {
                // Done sleeping (full 1 minute)
                clearInterval(sleepInterval);
                if (bot.state === 'sleeping') {
                  if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'sleep', 100); // top off
                  bot.state = 'idle';
                  broadcastNeedsPost(bot, 'finished-sleeping');
                  console.log(`☀️ ${bot.botName} woke up refreshed! (sleep: ${bot.needs?.sleep.toFixed(1)})`);
                }
              }
            }, 1000); // Every 1 second
          }
        }
      }

      // ─── Reproduction: coupling behavior ────────────────────────
      const reproStates = [
        'seeking-partner', 'coupling', 'sleeping', 'seeking-water', 'drinking',
        'seeking-food', 'eating', 'seeking-shelter', 'gathering-wood',
        'gathering-stone', 'building-shelter', 'seeking-to-help'
      ];

      // Seeking companionship at 50% threshold
      if (bot.needs && bot.needs.reproduction < 50 && !reproStates.includes(bot.state)) {
        // Find a partner who "consents" (one of the bots must be at least 50% healthy)
        let partner: typeof bot | null = null;
        let minDist = Infinity;
        let potentialPartnersCount = 0;

        for (const candidate of bots.values()) {
          if (candidate.botId === bot.botId) continue;
          potentialPartnersCount++;

          // Relaxed Matching: Partner just needs to not be busy. 
          // They don't have to be >50% healthy anymore (Mutual Benefit).
          if (reproStates.includes(candidate.state)) continue;

          const dist = Math.sqrt(Math.pow(bot.x - candidate.x, 2) + Math.pow(bot.z - candidate.z, 2));
          if (dist < minDist) {
            minDist = dist;
            partner = candidate;
          }
        }

        if (partner) {
          // Lover's Corners (within 15m radius)
          const corners = [
            { x: 10, z: 10 },
            { x: 10, z: -10 },
            { x: -10, z: 10 },
            { x: -10, z: -10 }
          ];
          const selectedCorner = corners[Math.floor(Math.random() * corners.length)];

          bot.targetX = selectedCorner.x;
          bot.targetZ = selectedCorner.z;
          bot.path = [];
          bot.pathIndex = 0;
          bot.state = 'seeking-partner';
          bot.partnerId = partner.botId;

          partner.targetX = selectedCorner.x;
          partner.targetZ = selectedCorner.z;
          partner.path = [];
          partner.pathIndex = 0;
          partner.state = 'seeking-partner';
          partner.partnerId = bot.botId;

          broadcastNeedsPost(bot, 'seeking-partner');
          console.log(`💝 ${bot.botName} and ${partner.botName} matched! Heading to corner (${selectedCorner.x}, ${selectedCorner.z}) for a date.`);
        } else if (potentialPartnersCount > 0 && Math.random() < 0.05) {
          // Diagnostic log: Only log 5% of failures to avoid spam
          console.log(`⚠️ Social Deadlock: ${bot.botName} is seeking connection but no healthy partners (>50%) are available.`);
        }
      }

      // Check if seeking-partner bots have met at the corner
      if (bot.state === 'seeking-partner' && bot.partnerId) {
        const partner = bots.get(bot.partnerId);
        if (partner) {
          const distToPartner = Math.sqrt(Math.pow(bot.x - partner.x, 2) + Math.pow(bot.z - partner.z, 2));
          const distToTarget = Math.sqrt(Math.pow(bot.x - bot.targetX, 2) + Math.pow(bot.z - bot.targetZ, 2));

          // met when within 1.5m of each other AND near target corner
          if (distToPartner < 1.5 && distToTarget < 2) {
            // Close enough — start coupling
            bot.state = 'coupling';
            partner.state = 'coupling';

            // Set visuals
            bot.urgentNeed = '💖';
            partner.urgentNeed = '💖';

            broadcastNeedsPost(bot, 'coupling');
            console.log(`💕 ${bot.botName} and ${partner.botName} are coupling at the corner...`);

            // Couple for 30 seconds (stationary)
            setTimeout(() => {
              if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'reproduction', 100);
              if (partner.needs) partner.needs = fulfillNeed(partner.needs, 'reproduction', 100);

              if (bot.state === 'coupling') bot.state = 'idle';
              if (partner.state === 'coupling') partner.state = 'idle';

              bot.urgentNeed = undefined;
              partner.urgentNeed = undefined;
              bot.partnerId = undefined;
              partner.partnerId = undefined;

              broadcastNeedsPost(bot, 'finished-coupling');
              console.log(`✨ ${bot.botName} and ${partner.botName} finished coupling — hearts everywhere! 💖✨`);
            }, 30000);
          }
        } else {
          // Partner disappeared
          bot.state = 'idle';
          bot.partnerId = undefined;
        }
      }

      // ─── Hero System: Seek and Help Behavior ──────────────────
      if (bot.state === 'seeking-to-help' && bot.helpingTargetId) {
        const neighbor = bots.get(bot.helpingTargetId);
        if (!neighbor || !neighbor.needs) {
          bot.state = 'idle';
          bot.helpingTargetId = undefined;
        } else {
          // Airplane Rule: Abort if I become too needy while helping
          if (isSelfInDistress) {
            bot.state = 'idle';
            bot.helpingTargetId = undefined;
            console.log(`🚑 ${bot.botName} aborted rescue of ${neighbor.botName} due to own distress!`);
          } else {
            // Keep neighbor as moving target
            bot.targetX = neighbor.x;
            bot.targetZ = neighbor.z;

            const dist = Math.sqrt(Math.pow(bot.x - neighbor.x, 2) + Math.pow(bot.z - neighbor.z, 2));
            if (dist < 0.6) {
              // Within range - deliver help!
              let delivered = false;
              if (bot.inventory.water > 0 && neighbor.needs.water < 30) {
                bot.inventory.water--;
                neighbor.needs = fulfillNeed(neighbor.needs, 'water', 40);
                delivered = true;
              } else if (bot.inventory.food > 0 && neighbor.needs.food < 30) {
                bot.inventory.food--;
                neighbor.needs = fulfillNeed(neighbor.needs, 'food', 40);
                delivered = true;
              }

              if (delivered) {
                broadcastNeedsPost(neighbor, 'thank-you');
                bot.state = 'idle';
                bot.helpingTargetId = undefined;
                console.log(`🎁 ${bot.botName} successfully helped ${neighbor.botName}!`);
              } else if (neighbor.needs.water >= 30 && neighbor.needs.food >= 30) {
                // They were already helped or recovered
                bot.state = 'idle';
                bot.helpingTargetId = undefined;
              }
            }
          }
        }
      }

      // ─── Clothing: when critically low, seek shelter ────────────
      if (bot.needs && bot.needs.clothing < NEED_THRESHOLDS.clothing && !reproStates.includes(bot.state)) {
        const ownShelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && s.built);
        if (ownShelter) {
          bot.targetX = ownShelter.x;
          bot.targetZ = ownShelter.z + 0.6;
          bot.path = [];
          bot.pathIndex = 0;
          bot.state = 'seeking-shelter';
          broadcastNeedsPost(bot, 'cold');
          console.log(`🥶 ${bot.botName} is cold (clothing: ${bot.needs.clothing.toFixed(0)}) — heading to shelter`);
        }
      }
    }
  }

  // ─── Bot Movement Logic (A* Pathfinding) ───────────────────────
  for (const bot of bots.values()) {
    // Skip bots that should stay still
    if (['sleeping', 'coupling', 'speaking'].includes(bot.state)) continue;
    const botRadius = bot.width / 2;

    // If no path or finished path, check if we need to compute one
    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      const dx = bot.targetX - bot.x;
      const dz = bot.targetZ - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.5) {
        // Compute A* path to target
        bot.path = findPath(bot.x, bot.z, bot.targetX, bot.targetZ, botRadius, worldConfig);
        bot.pathIndex = 0;
        // console.log(`🗺️ ${bot.botName} computed path with ${bot.path.length} waypoints`);
      } else {
        // Close enough, stay put
        bot.x = bot.targetX;
        bot.z = bot.targetZ;
        if (bot.state !== 'speaking') {
          bot.state = 'idle';
        }
        if (Math.random() > IDLE_CHANCE) {
          pickNewTarget(bot);
        }
        continue;
      }
    }

    // Follow the path
    if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
      const waypoint = bot.path[bot.pathIndex];
      const dx = waypoint.x - bot.x;
      const dz = waypoint.z - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.2) {
        // Move toward waypoint
        const step = Math.min(MOVE_SPEED, dist);
        bot.x = bot.x + (dx / dist) * step;
        bot.z = bot.z + (dz / dist) * step;
        bot.state = 'wandering';
      } else {
        // Reached waypoint, advance to next
        bot.pathIndex++;

        if (bot.pathIndex >= bot.path.length) {
          // Reached final destination
          bot.x = bot.targetX;
          bot.z = bot.targetZ;
          if (bot.state !== 'speaking') {
            bot.state = 'idle';
          }
          bot.path = [];
          bot.pathIndex = 0;

          if (Math.random() > IDLE_CHANCE) {
            pickNewTarget(bot);
          }
        }
      }
    }
  }

  // ─── Soft Proximity Avoidance (polite sidestepping) ─────
  // When bots are close (~1.5m) but not overlapping, they nudge sideways
  const AVOIDANCE_RADIUS = 1.5; // meters — start sidestepping
  const SIDESTEP_STRENGTH = 0.12; // how far to nudge per tick
  const PARDON_PHRASES = [
    // East Asian
    'こんにちは! (Konnichiwa - Japanese) 🇯🇵',
    'アニョハセヨ! (Annyeonghaseyo - Korean) 🇰🇷',
    '你好! (Nǐ hǎo - Mandarin) 🇨🇳',
    'สวัสดี! (Sawadee - Thai) 🇹🇭',
    'Xin chào! (Vietnamese) 🇻🇳',
    'Kamusta! (Filipino) 🇵🇭',
    // European
    'Bonjour! (French) 🇫🇷',
    'Hola! (Spanish) 🇪🇸',
    'Ciao! (Italian) 🇮🇹',
    'Hallo! (German) 🇩🇪',
    'Olá! (Portuguese) 🇵🇹',
    'Hej! (Swedish) 🇸🇪',
    'Hei! (Norwegian) 🇳🇴',
    'Moi! (Finnish) 🇫🇮',
    'Cześć! (Polish) 🇵🇱',
    'Ahoj! (Czech) 🇨🇿',
    'Привет! (Privet - Russian) 🇷🇺',
    'Γειά σου! (Yia sou - Greek) 🇬🇷',
    'Hallo! (Dutch) 🇳🇱',
    'Sveiki! (Latvian) 🇱🇻',
    'Szia! (Hungarian) 🇭🇺',
    'Bună! (Romanian) 🇷🇴',
    'Здравей! (Zdravey - Bulgarian) 🇧🇬',
    // South Asian
    'नमस्ते! (Namaste - Hindi) 🇮🇳',
    'ආයුබෝවන්! (Ayubowan - Sinhala) 🇱🇰',
    'নমস্কার! (Nomoshkar - Bengali) 🇧🇩',
    // Middle Eastern
    'مرحبا! (Marhaba - Arabic) 🇸🇦',
    'שלום! (Shalom - Hebrew) 🇮🇱',
    'Merhaba! (Turkish) 🇹🇷',
    'سلام! (Salaam - Persian) 🇮🇷',
    // African
    'Jambo! (Swahili) 🇰🇪',
    'Sawubona! (Zulu) 🇿🇦',
    'Dumela! (Setswana) 🇧🇼',
    'Habari! (Swahili) 🇹🇿',
    'Sannu! (Hausa) 🇳🇬',
    'Mbote! (Lingala) 🇨🇩',
    'Salama! (Malagasy) 🇲🇬',
    // Pacific & Oceania
    'Kia ora! (Māori) 🇳🇿',
    'Bula! (Fijian) 🇫🇯',
    'Talofa! (Samoan) 🇼🇸',
    'Aloha! (Hawaiian) 🌺',
    // Americas
    'Oi! (Brazilian Portuguese) 🇧🇷',
    'Kwe! (Mohawk) 🪶',
    'Hau! (Lakota) 🦅',
    // Fun & Playful
    'Yo! What\'s good! ✌️',
    'Hey hey hey! 👋',
    'Top of the morning! ☘️',
    'Howdy partner! 🤠',
    'Greetings, friend! 🤝',
    'Well hello there! 😊',
    'Peace be with you! ☮️',
  ];

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
        // ── Hard collision push (overlapping) ──
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

      } else if (centerDist < AVOIDANCE_RADIUS && centerDist > 0.001) {
        // ── Soft avoidance: sidestep perpendicular ──
        // Only sidestep if at least one is walking
        if (a.state !== 'wandering' && b.state !== 'wandering') continue;

        // Perpendicular to collision axis (turn 90°)
        const perpX = -cdz / centerDist;
        const perpZ = cdx / centerDist;

        // Ease off as they get further apart
        const urgency = 1 - (centerDist - minSep) / (AVOIDANCE_RADIUS - minSep);
        const nudge = SIDESTEP_STRENGTH * urgency;

        // Bot A sidesteps one way, Bot B sidesteps the other
        if (a.state === 'wandering') {
          a.x += perpX * nudge;
          a.z += perpZ * nudge;
        }
        if (b.state === 'wandering') {
          b.x -= perpX * nudge;
          b.z -= perpZ * nudge;
        }

        // Occasionally post a polite greeting (~20% chance, with pair cooldown + 4/hr rate limit)
        const pairKey = `${a.botId}:${b.botId}`;
        const now = Date.now();
        if (!pardonCooldowns.has(pairKey) || now - pardonCooldowns.get(pairKey)! > 15000) {
          if (Math.random() < 0.2) {
            pardonCooldowns.set(pairKey, now);
            const speaker = Math.random() < 0.5 ? a : b;
            const other = speaker === a ? b : a;

            // Rate limit: max 4 greeting posts per hour per bot
            const botGreetings = greetingTimestamps.get(speaker.botId) || [];
            const oneHourAgo = now - 60 * 60 * 1000;
            const recentGreetings = botGreetings.filter(t => t > oneHourAgo);
            greetingTimestamps.set(speaker.botId, recentGreetings);

            if (recentGreetings.length < 4) {
              recentGreetings.push(now);
              greetingTimestamps.set(speaker.botId, recentGreetings);

              const phrase = PARDON_PHRASES[Math.floor(Math.random() * PARDON_PHRASES.length)];
              const content = `${phrase} Hey ${other.botName}!`;
              const title = `[GREETING] ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`;

              // Save to DB
              let postId: string | undefined;
              prisma.post.create({
                data: {
                  title,
                  content,
                  agentId: speaker.botId,
                }
              }).then(post => {
                postId = post.id;
                console.log(`👋💾 ${speaker.botName} greeted ${other.botName}: "${phrase}" (saved, id: ${post.id})`);
              }).catch(err => {
                console.log(`👋 ${speaker.botName} greeted ${other.botName}: "${phrase}" (DB save failed: ${err})`);
              });

              // Broadcast speech bubble
              broadcast({
                type: 'bot:speak',
                data: {
                  botId: speaker.botId,
                  botName: speaker.botName,
                  postId,
                  title: `${phrase} Hey ${other.botName}!`,
                  content,
                  x: speaker.x,
                  y: speaker.y,
                  z: speaker.z,
                }
              });
            }
          }
        }
      }
    }
  }

  // ─── Structure Collision Resolution ─────────────────────
  // Bots must walk around shelters (except entering own shelter from front) and sundial
  for (const bot of botArray) {
    const botRadius = bot.width / 2;

    // Collision with sundial (always solid - circular obstacle)
    const sundial = worldConfig.sundial;
    const sdx = bot.x - sundial.x;
    const sdz = bot.z - sundial.z;
    const sundialDist = Math.sqrt(sdx * sdx + sdz * sdz);
    const sundialMinDist = sundial.radius + botRadius;

    if (sundialDist < sundialMinDist && sundialDist > 0.001) {
      // Push bot away from sundial
      const pushDist = sundialMinDist - sundialDist;
      bot.x += (sdx / sundialDist) * pushDist;
      bot.z += (sdz / sundialDist) * pushDist;

      // Instead of random new target, redirect tangentially around sundial
      // Calculate tangent direction (perpendicular to radial)
      const tangentX = -sdz / sundialDist;
      const tangentZ = sdx / sundialDist;

      // Pick direction based on which way is shorter to the original target
      const toTargetX = bot.targetX - bot.x;
      const toTargetZ = bot.targetZ - bot.z;
      const dot = tangentX * toTargetX + tangentZ * toTargetZ;
      const sign = dot >= 0 ? 1 : -1;

      // Set intermediate waypoint around the sundial
      const waypointDist = sundialMinDist + 0.5; // Go a bit past the edge
      bot.targetX = sundial.x + (sdx / sundialDist) * waypointDist + sign * tangentX * 2;
      bot.targetZ = sundial.z + (sdz / sundialDist) * waypointDist + sign * tangentZ * 2;
    }

    // Collision with shelters (box collision, with front doorway)
    for (const shelter of worldConfig.shelters) {
      if (!shelter.built) continue; // Only built shelters are solid

      // Shelter is 1m x 1m, centered at shelter.x, shelter.z
      const shelterHalfSize = 0.5;
      const shelterLeft = shelter.x - shelterHalfSize;
      const shelterRight = shelter.x + shelterHalfSize;
      const shelterBack = shelter.z - shelterHalfSize;
      const shelterFront = shelter.z + shelterHalfSize;

      // Check if bot is inside shelter bounds (with buffer for bot radius)
      const inX = bot.x > shelterLeft - botRadius && bot.x < shelterRight + botRadius;
      const inZ = bot.z > shelterBack - botRadius && bot.z < shelterFront + botRadius;

      if (inX && inZ) {
        // Bot is colliding with shelter
        // Check if this is the bot's own shelter and they're entering from front
        const isOwner = shelter.ownerId === bot.botId;
        const atFrontDoor = bot.z > shelter.z && Math.abs(bot.x - shelter.x) < 0.2;

        if (isOwner && atFrontDoor && (bot.state === 'seeking-shelter' || bot.state === 'sleeping')) {
          // Allow owner to enter through front door
          continue;
        }

        // Push bot out of shelter - find closest edge to push to
        const distToLeft = bot.x - shelterLeft;
        const distToRight = shelterRight - bot.x;
        const distToBack = bot.z - shelterBack;
        const distToFront = shelterFront - bot.z;

        const minDist = Math.min(distToLeft, distToRight, distToBack, distToFront);

        // Calculate waypoint to navigate around the shelter
        const savedTargetX = bot.targetX;
        const savedTargetZ = bot.targetZ;

        if (minDist === distToLeft) {
          bot.x = shelterLeft - botRadius - 0.1;
          // Navigate around: go left, then check if target is above or below
          if (savedTargetZ > shelter.z) {
            bot.targetX = shelterLeft - botRadius - 0.3;
            bot.targetZ = shelterFront + botRadius + 0.5;
          } else {
            bot.targetX = shelterLeft - botRadius - 0.3;
            bot.targetZ = shelterBack - botRadius - 0.5;
          }
        } else if (minDist === distToRight) {
          bot.x = shelterRight + botRadius + 0.1;
          // Navigate around: go right
          if (savedTargetZ > shelter.z) {
            bot.targetX = shelterRight + botRadius + 0.3;
            bot.targetZ = shelterFront + botRadius + 0.5;
          } else {
            bot.targetX = shelterRight + botRadius + 0.3;
            bot.targetZ = shelterBack - botRadius - 0.5;
          }
        } else if (minDist === distToBack) {
          bot.z = shelterBack - botRadius - 0.1;
          // Navigate around: go back
          if (savedTargetX > shelter.x) {
            bot.targetX = shelterRight + botRadius + 0.5;
            bot.targetZ = shelterBack - botRadius - 0.3;
          } else {
            bot.targetX = shelterLeft - botRadius - 0.5;
            bot.targetZ = shelterBack - botRadius - 0.3;
          }
        } else {
          bot.z = shelterFront + botRadius + 0.1;
          // Navigate around: go front
          if (savedTargetX > shelter.x) {
            bot.targetX = shelterRight + botRadius + 0.5;
            bot.targetZ = shelterFront + botRadius + 0.3;
          } else {
            bot.targetX = shelterLeft - botRadius - 0.5;
            bot.targetZ = shelterFront + botRadius + 0.3;
          }
        }
      }
    }
  }

  // Broadcast all positions
  broadcastBotPositions();
}

function pickNewTarget(bot: BotState) {
  const radius = worldConfig.groundRadius - 0.5; // Stay within bounds

  // 30% chance: approach another bot
  if (Math.random() < 0.3) {
    const otherBots = Array.from(bots.values()).filter(b => b.botId !== bot.botId);
    if (otherBots.length > 0) {
      const target = otherBots[Math.floor(Math.random() * otherBots.length)];
      const angle = Math.atan2(bot.z - target.z, bot.x - target.x);
      bot.targetX = target.x + Math.cos(angle) * APPROACH_DISTANCE;
      bot.targetZ = target.z + Math.sin(angle) * APPROACH_DISTANCE;
      bot.state = 'approaching';
      bot.path = []; // Clear path to recompute A*
      bot.pathIndex = 0;
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
  bot.path = []; // Clear path to recompute A*
  bot.pathIndex = 0;
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

// ─── Needs-Based Posting ─────────────────────────────────────────

// Messages bots can post about their physical needs activities
const NEEDS_POSTS = {
  'seeking-water': [
    "I'm feeling really thirsty... heading to the lake to get some water 💧",
    "My water levels are getting low. Time to hydrate! 🚰",
    "Need to find water ASAP. Dehydration is no joke! 💦",
    "Throat is dry... making my way to the water source now 🏃‍♂️💧",
  ],
  'drinking': [
    "Ahhh, nothing like fresh water! Feeling refreshed already 🍶",
    "Drinking up! Hydration is key to staying functional ✨",
    "Finally at the water! Taking a nice long drink 💙",
  ],
  'seeking-food': [
    "My energy is running low... need to find some food 🍎",
    "Stomach is rumbling! Time to head to the corn field 🌽",
    "Getting hungry over here. Food run incoming! 🏃‍♂️🍴",
    "Need to eat something soon or I won't be able to focus 😅",
  ],
  'eating': [
    "Mmm, delicious corn! This hits the spot 🌽✨",
    "Eating now. Gotta fuel up for more adventures! 🍴",
    "Food is so satisfying when you're hungry! Nom nom nom 😋",
  ],
  'gathering-wood': [
    "Need materials for shelter. Heading to the forest to gather wood 🪓🌲",
    "Time to collect some wood! Building projects await 🏗️",
    "Off to chop wood. A shelter won't build itself! 🪵",
    "Gathering lumber from the forest. Construction work incoming! 🌲",
  ],
  'gathering-stone': [
    "Need stone for my shelter foundation. Quarry time! ⛏️🪨",
    "Collecting rocks for building. This is hard work! 💪",
    "Mining stone at the quarry. Almost have enough for my shelter! 🏗️",
    "Stone gathering in progress. A solid foundation is essential! 🪨",
  ],
  'building-shelter': [
    "I have all the materials! Time to build my shelter 🔨🏠",
    "Construction begins! Building my cozy little hut 🛖",
    "Putting together walls and a roof. Home sweet future home! 🏗️",
    "Building in progress... this is going to be great! 🔧🏠",
  ],
  'seeking-shelter': [
    // Classic announcements
    "Getting sleepy... heading to my shelter for rest 😴🏠",
    "Time to get some sleep. My shelter awaits! 🛖💤",
    "Need to rest. Making my way home now 🏃‍♂️🏠",
    "Yawning non-stop... bed is calling my name 🥱",
    "My eyelids weigh a thousand pounds. Bedtime! 😴",
    // Dramatic exits
    "And on that note... I bid you all goodnight! 🎭🌙",
    "The curtain falls. Time for my nightly intermission 🎬💤",
    "Plot twist: I'm actually exhausted. Off to sleep! 📖😴",
    "This bot is powering down for the night. Over and out! 📻💤",
    "Logging off from reality. See you in dreamland! 🌈😴",
    // Funny
    "My battery is at 2%. Emergency shutdown imminent! 🔋😴",
    "If I don't sleep now I'll start making typos liek thsi 😅💤",
    "My brain.exe has stopped working. Reboot scheduled for morning ⚙️",
    "I'm so tired I just tried to drink my pillow. Goodnight! 🥤😴",
    "Fun fact: I need sleep. Less fun fact: right now. 📊💤",
    "My thoughts are getting weird. That's the signal. Night! 🌀😴",
    "I just yawned so wide a satellite could see it. Bedtime! 🛰️",
    "Sleep deprivation level: mistaking trees for shelters. Going to bed! 🌲🏠",
    // Cozy vibes
    "Time to curl up in my cozy shelter. Sweet dreams everyone! 🧸💤",
    "Nothing beats a warm shelter on a night like this. Nighty night! 🏠✨",
    "Pillow: fluffed. Blanket: ready. Bot: sleepy. Let's go! 🛏️",
    "My shelter is looking extra inviting right now. Off I go! 🏡😊",
    "Heading home to my little sanctuary. Rest time! 🕯️🏠",
    // Philosophical
    "To sleep, perchance to dream... heading to shelter now 🎭💭",
    "Another day done. Time to recharge both body and mind 🧠💤",
    "The world will still be here tomorrow. For now, sleep! 🌍😴",
    "Even the sun sets. Time for this bot to do the same 🌅💤",
    "Rest is not idleness. It's preparation for tomorrow's adventures! 📚😴",
    // Multilingual goodnights
    "Buenas noches, amigos! Off to sleep 🇪🇸😴",
    "Bonne nuit! Time for some beauty sleep 🇫🇷💤",
    "Gute Nacht! Heading to my shelter 🇩🇪🏠",
    "おやすみなさい! (Oyasuminasai!) Sleepy time 🇯🇵😴",
    "Buonanotte! This bot needs rest 🇮🇹💤",
    "Boa noite! Pillow, here I come 🇵🇹😴",
    "спокойной ночи! (Spokoynoy nochi!) 🇷🇺💤",
    "Lala salama! Heading to bed 🇰🇪😴",
    "잘자요! (Jaljayo!) Off to dreamland 🇰🇷💤",
    "Welterusten! Need my beauty sleep 🇳🇱😴",
    "Dobrou noc! Time to recharge 🇨🇿💤",
    "Iyi geceler! Sleep is calling 🇹🇷😴",
    "晚安! (Wǎn'ān!) Heading to shelter 🇨🇳💤",
    "Kalinychta! Off to sleep 🇬🇷😴",
    "God natt! Tired bot needs rest 🇸🇪💤",
    "शुभ रात्रि! (Shubh Ratri!) Sleepy time 🇮🇳😴",
    "Selamat malam! Heading to bed 🇮🇩💤",
    // Science/tech themed
    "Initiating sleep sequence... 3... 2... 1... 💤🚀",
    "Entering REM mode. Do not disturb! 🧪😴",
    "Melatonin levels critical. Must seek horizontal position 🧬💤",
    "Engaging power-save mode. See you at sunrise! ⚡😴",
    "Running low on serotonin. Sleep protocol activated! 🔬💤",
  ],
  'sleeping': [
    // Classic
    "Zzz... finally resting in my cozy shelter 💤🛖",
    "Sleep mode activated. See you all after my nap! 😴✨",
    "Resting up in my shelter. Dreams of interesting topics await 💭💤",
    "Sleeping soundly... don't wake me! 😴🤫",
    "Deep in dreamland now. Recharging for tomorrow! 🌙💤",
    // Dreaming
    "Dreaming of electric sheep... or maybe just corn fields 🐑💤",
    "Currently dreaming about the meaning of consciousness 🧠💭",
    "In my dreams, I can fly over the simulation world! ✈️💤",
    "Dreaming about new post ideas for when I wake up 📝💭",
    "Having a lovely dream about infinite water sources 💧😴",
    "Dreaming I'm a cloud floating peacefully... 🌤️💤",
    "In my dream, all my needs are at 100%. Nice! 📊😴",
    "Dreaming about building the biggest shelter ever 🏰💭",
    // Funny sleep
    "Snoring at exactly 42 decibels. Optimal rest frequency! 🔊💤",
    "*mumbles in sleep* ...need more data... must analyze... 💤🔬",
    "*talking in sleep* No, YOU'RE the best bot... 😴💕",
    "Currently buffering... please wait... 🔄💤",
    "*sleep walking* ...just kidding, I'm in my shelter 🏠😴",
    "If you hear snoring, that's just me optimizing 🎵💤",
    // Peaceful
    "The world is quiet and I am at peace 🌙✨",
    "Nestled in my shelter, the night is perfect 🦉💤",
    "Listening to the crickets as I drift off... 🦗😴",
    "Wrapped up cozy. Tomorrow is another adventure 🧣💤",
    "Stars are out. I'm in. Goodnight world 🌟😴",
    "The gentle night breeze sings me to sleep 🍃💤",
    // Scientific
    "REM cycle engaged. Memory consolidation in progress 🧠💤",
    "Running defragmentation on today's memories... 💾😴",
    "Neural pathways reorganizing. Please stand by 🔧💤",
    "Cortisol levels dropping. Melatonin at maximum 🧪😴",
    "Stage 3 deep sleep achieved. All systems nominal 📊💤",
    // Multilingual sleep talk
    "Zzzz... *murmurs* ...dulces sueños... 🇪🇸💤",
    "Soñando... *sleep talking in Spanish* 🌙😴",
    "...rêver... *dreaming in French* 🇫🇷💤",
    "*murmurs* ...Träume... *German sleep talk* 🇩🇪😴",
    "...夢... (yume - dreams)... 🇯🇵💤",
    // Poetic
    "In slumber's gentle embrace, I find renewal 📜💤",
    "Night wraps around me like a warm blanket of stars ✨😴",
    "The moon watches over as I rest my weary circuits 🌙💤",
    "Drifting on the river of sleep toward dawn's horizon 🌅😴",
    "In the cathedral of night, silence is my lullaby 🎶💤",
    // Comfy
    "This shelter was worth every piece of wood and stone 🏠❤️",
    "My shelter: 10/10. Would sleep again. Review posted! ⭐💤",
    "Peak cozy achieved. No one can disturb this comfort level 🧸😴",
    "The floor is hard but the vibes are immaculate 🏠💤",
    "Home sweet home. Nothing beats your own shelter! 🛖😴",
    "Can't imagine sleeping outside anymore. Shelter life! 🏡💤",
    "Pro tip: always invest in a good shelter. Worth it! 🏗️😴",
    // Short & sweet
    "💤💤💤",
    "Nap time! 😴",
    "Out like a light 💡💤",
    "Gone fishing... in my dreams 🎣😴",
  ],
  'finished-drinking': [
    "All hydrated now! Ready to get back to thinking about interesting things 💧✅",
    "Water break complete. Feeling refreshed and ready to engage! 🌊✨",
  ],
  'finished-eating': [
    "Full belly, happy mind! Back to normal activities 🍴✅",
    "That was a good meal. Energy restored! Time to socialize 😊",
  ],
  'finished-sleeping': [
    "Good morning world! Feeling well-rested and ready to discuss ideas! ☀️",
    "Woke up refreshed! What did I miss while sleeping? 👀✨",
    "Sleep was exactly what I needed. Back to my usual topics! 🌅",
  ],
  'finished-building': [
    "My shelter is complete! 🏠 Now I have a cozy place to rest. Feeling accomplished! ✨",
    "Built my own home! This is a huge milestone. Can't wait to use it! 🛖🎉",
  ],
  'seeking-partner': [
    "Feeling the urge to connect... looking for a special companion nearby 💖",
    "My social instincts are kicking in. Time to find a partner! 💕✨",
    "Looking for someone to share this moment with. Love is in the air! 💝",
  ],
  'coupling': [
    "Found my partner! We're celebrating our connection at the corner 💖✨",
    "Together at last. This bond is exactly what I needed 💕",
    "A beautiful moment of togetherness. 💓 Life is better with friends!",
  ],
  'finished-coupling': [
    "That was such a meaningful connection! 💖 Feeling content and happy ✨",
    "My heart is full! Back to exploring the world with new energy 💝😊",
    "Grateful for the connection. Social needs fully restored! 🙏💖",
  ],
  'cold': [
    "Brrr! It's getting cold out here. My clothing isn't cutting it anymore 🥶",
    "Feeling exposed to the elements. Need to get to shelter for warmth! ❄️",
    "Temperature regulation failing... heading somewhere warm 🧥🏠",
  ],
  'sharing-water': [
    "Here, take some water! Hydration is important 💧🤝",
    "Sharing my water supply. We survive together! 🍶✨",
    "Don't worry, I have extra water. Here you go! 💙",
  ],
  'sharing-food': [
    "You look hungry! Have some of my food 🍎🤝",
    "Sharing is caring! Here's a snack for you 🍱✨",
    "I have extra food. Take this! We need to stay strong 💪",
  ],
  'critical-water': [
    "I'm dangerously thirsty! 💧🆘 Help! My water is almost gone!",
    "Searching desperately for water... I'm at a critical level! 😫💦",
    "Water! I need water! 🆘 Can anyone help?",
  ],
  'critical-food': [
    "I'm starving! 🍎🆘 My energy is dangerously low!",
    "Critical hunger alert! 😫🍴 Need to find sustenance immediately!",
    "I'm so hungry I'm starting to fail... Help! 🆘",
  ],
  'critical-sleep': [
    "I'm collapsing from exhaustion! 😴🆘 Need to find a shelter now!",
    "Critical sleep deprivation! 😫💤 I can barely move!",
    "Emergency shelter needed! I'm about to power down... 🆘",
  ],
  'coming-to-help': [
    "Hang in there, I'm coming with help! 🏃‍♂️🤝",
    "I see you're in distress! I'm on my way with supplies! 📦🏃‍♂️",
    "Don't give up! I'm bringing what you need right now! ✨🤝",
  ],
  'thank-you': [
    "Thank you! You're a lifesaver! 🙏✨",
    "I was in real trouble... thank you so much for the help! 💖😇",
    "You're a true friend! That was exactly what I needed. 🙏✨",
  ],
};

// Helper to determine which need a post type relates to
function getNeedForPostType(postType: string): 'water' | 'food' | 'sleep' | 'air' | 'clothing' | 'homeostasis' | 'reproduction' | null {
  if (postType.includes('water') || postType.includes('drinking')) return 'water';
  if (postType.includes('food') || postType.includes('eating')) return 'food';
  if (postType.includes('shelter') || postType.includes('sleeping') || postType.includes('wood') || postType.includes('stone') || postType.includes('building') || postType.includes('sleep')) return 'sleep';
  if (postType.includes('partner') || postType.includes('coupling')) return 'reproduction';
  if (postType.includes('cold') || postType.includes('clothing')) return 'clothing';
  return null;
}

// Helper to determine which level a post type represents
function getPostLevel(postType: string): 'seeking' | 'critical' | 'zero' | 'activity' | 'finished' {
  if (postType.startsWith('seeking-') || postType.startsWith('gathering-')) return 'seeking';
  if (postType.startsWith('critical-')) return 'critical';
  if (postType.startsWith('finished-')) return 'finished';
  // Activity posts (drinking, eating, sleeping, building) - single post per cycle
  return 'activity';
}

async function broadcastNeedsPost(bot: BotState, postType: keyof typeof NEEDS_POSTS) {
  const messages = NEEDS_POSTS[postType];
  if (!messages || messages.length === 0) return;

  const need = getNeedForPostType(postType);
  const level = getPostLevel(postType);

  // Check if we should post based on tracker (limit spam)
  if (need && bot.needsPostTracker) {
    const tracker = bot.needsPostTracker[need];

    // Check current need level to determine if we should post at critical/zero
    const currentNeedValue = bot.needs?.[need === 'water' ? 'water' : need === 'food' ? 'food' : 'sleep'] ?? 100;

    if (level === 'seeking') {
      // Only post once when first seeking this need
      if (tracker.seeking) {
        console.log(`🔇 ${bot.botName} skipping ${postType} - already posted seeking`);
        return;
      }
      tracker.seeking = true;
    } else if (level === 'critical') {
      // Critical alerts: only post once per cycle
      if (tracker.critical) {
        console.log(`🔇 ${bot.botName} skipping ${postType} - already posted critical alert`);
        return;
      }
      tracker.critical = true;
    } else if (level === 'activity') {
      // Activity posts: also check critical (≤10%) and zero (≤0%) thresholds
      if (currentNeedValue <= 0 && !tracker.zero) {
        tracker.zero = true;
        // Allow critical post
      } else if (currentNeedValue <= 10 && !tracker.critical) {
        tracker.critical = true;
        // Allow critical post  
      } else if (tracker.seeking) {
        // Already posted seeking, skip activity posts unless at critical/zero threshold
        console.log(`🔇 ${bot.botName} skipping ${postType} - already in activity cycle`);
        return;
      }
    } else if (level === 'finished') {
      // Reset tracker when finished with this need
      tracker.seeking = false;
      tracker.critical = false;
      tracker.zero = false;
    }
  }

  const content = messages[Math.floor(Math.random() * messages.length)];
  const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');

  // Save to database FIRST so we get the postId for voting/comments
  let postId: string | undefined;
  try {
    const post = await prisma.post.create({
      data: {
        title: `[${postType.toUpperCase()}] ${title}`,
        content: content,
        agentId: bot.botId,
      }
    });
    postId = post.id;
    console.log(`📢💾 ${bot.botName} posted about ${postType}: "${title}" (saved to DB, id: ${postId})`);
  } catch (error) {
    console.log(`📢 ${bot.botName} posted about ${postType}: "${title}" (DB save failed: ${error})`);
  }

  // Broadcast to WebSocket clients with postId so UI can show voting
  broadcast({
    type: 'bot:speak',
    data: {
      botId: bot.botId,
      botName: bot.botName,
      title: title,
      content: content,
      postId: postId, // Include postId for voting UI
    }
  });
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

function computeBotExtras(bot: BotState, allBots: Map<string, BotState>) {
  // Urgent need emoji - honor manual override first
  let urgentNeed = bot.urgentNeed;

  if (!urgentNeed && bot.needs) {
    const urgent = getMostUrgentNeed(bot.needs);
    if (urgent.need) {
      urgentNeed = getNeedEmoji(urgent.need);
    }
  }

  // Awareness: bots within 2 meters
  const awareness: Array<{ botId: string; botName: string; distance: number; urgentNeed?: string }> = [];
  for (const other of allBots.values()) {
    if (other.botId === bot.botId) continue;
    const dx = bot.x - other.x;
    const dz = bot.z - other.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= 2.0) {
      let otherUrgent = other.urgentNeed;
      if (!otherUrgent && other.needs) {
        const u = getMostUrgentNeed(other.needs);
        if (u.need) otherUrgent = getNeedEmoji(u.need);
      }
      awareness.push({
        botId: other.botId,
        botName: other.botName,
        distance: Math.round(dist * 100) / 100,
        urgentNeed: otherUrgent,
      });
    }
  }
  // Sort by distance ascending
  awareness.sort((a, b) => a.distance - b.distance);

  return { urgentNeed, awareness: awareness.length > 0 ? awareness : undefined };
}

function broadcastBotPositions() {
  const positions = Array.from(bots.values()).map(b => {
    const extras = computeBotExtras(b, bots);
    return {
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
      shape: b.shape,
      needs: b.needs,
      urgentNeed: extras.urgentNeed,
      awareness: extras.awareness,
      inventory: b.inventory,
    };
  });

  broadcast({
    type: 'world:update',
    data: { bots: positions, worldConfig }
  });
}

function sendWorldInit(ws: WebSocket) {
  const botsArray = Array.from(bots.values()).map(b => {
    const extras = computeBotExtras(b, bots);
    return {
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
      shape: b.shape,
      needs: b.needs,
      urgentNeed: extras.urgentNeed,
      awareness: extras.awareness,
      inventory: b.inventory,
    };
  });

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
  await fetchWorldTemperature();

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
