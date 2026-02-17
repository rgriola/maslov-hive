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
          inventory: { wood: 0, stone: 0 },
          needsPostTracker: {
            water: { seeking: false, critical: false, zero: false },
            food: { seeking: false, critical: false, zero: false },
            sleep: { seeking: false, critical: false, zero: false },
          },
          path: [],
          pathIndex: 0,
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;

        // Enable needs for ScienceBot (Phase 1: Water only)
        if (d.name === 'ScienceBot') {
          bot.needs = initializeNeeds();
          bot.lastNeedUpdate = new Date();
          console.log(`   💧 ${d.name} needs system enabled (starting water: ${bot.needs.water})`);
        }

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
          inventory: { wood: 0, stone: 0 },
          needsPostTracker: {
            water: { seeking: false, critical: false, zero: false },
            food: { seeking: false, critical: false, zero: false },
            sleep: { seeking: false, critical: false, zero: false },
          },
          path: [],
          pathIndex: 0,
        };
        bot.targetX = bot.x;
        bot.targetZ = bot.z;

        // Enable needs for ScienceBot (Phase 1: Water only)
        if (agent.name.toLowerCase().includes('science')) {
          bot.needs = initializeNeeds();
          bot.lastNeedUpdate = new Date();
          console.log(`   💧 ${agent.name} needs system enabled (starting water: ${bot.needs.water})`);
        }

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
        inventory: { wood: 0, stone: 0 },
        needsPostTracker: {
          water: { seeking: false, critical: false, zero: false },
          food: { seeking: false, critical: false, zero: false },
          sleep: { seeking: false, critical: false, zero: false },
        },
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
      bot.needs = decayNeeds(bot.needs, elapsedMinutes);
      bot.lastNeedUpdate = now;

      // Check if bot needs water
      const urgentNeed = getMostUrgentNeed(bot.needs);

      if (urgentNeed.need === 'water' && bot.state !== 'drinking' && bot.state !== 'seeking-water') {
        // Bot needs water! Find nearest water spot
        const nearestWater = worldConfig.waterSpots[0]; // For now just use first water spot
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

      // Check if bot reached water
      if (bot.state === 'seeking-water' && worldConfig.waterSpots.length > 0) {
        const water = worldConfig.waterSpots[0];
        const distToWater = Math.sqrt(
          Math.pow(bot.x - water.x, 2) + Math.pow(bot.z - water.z, 2)
        );

        if (distToWater < water.radius) {
          // Bot is at water! Start drinking
          bot.state = 'drinking';
          bot.needs = fulfillNeed(bot.needs, 'water', 100);
          broadcastNeedsPost(bot, 'drinking');
          console.log(`🍶 ${bot.botName} is drinking! Water restored to ${bot.needs.water.toFixed(1)}`);

          // Drink for a moment then return to wandering
          setTimeout(() => {
            if (bot.state === 'drinking') {
              bot.state = 'idle';
              broadcastNeedsPost(bot, 'finished-drinking');
              console.log(`✅ ${bot.botName} finished drinking, back to normal activity`);
            }
          }, 3000); // Drink for 3 seconds
        }
      }

      // Check if bot needs food (only if not already seeking water or drinking)
      if (urgentNeed.need === 'food' && !['drinking', 'seeking-water', 'eating', 'seeking-food'].includes(bot.state)) {
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

      // Check if bot reached food
      if (bot.state === 'seeking-food' && worldConfig.foodSpots.length > 0) {
        const food = worldConfig.foodSpots[0];
        const distToFood = Math.sqrt(
          Math.pow(bot.x - food.x, 2) + Math.pow(bot.z - food.z, 2)
        );

        if (distToFood < food.radius) {
          // Bot is at food! Start eating
          bot.state = 'eating';
          bot.needs = fulfillNeed(bot.needs, 'food', 100);
          broadcastNeedsPost(bot, 'eating');
          console.log(`🍴 ${bot.botName} is eating! Food restored to ${bot.needs.food.toFixed(1)}`);

          // Eat for a moment then return to wandering
          setTimeout(() => {
            if (bot.state === 'eating') {
              bot.state = 'idle';
              broadcastNeedsPost(bot, 'finished-eating');
              console.log(`✅ ${bot.botName} finished eating, back to normal activity`);
            }
          }, 4000); // Eat for 4 seconds (longer than drinking)
        }
      }

      // ─── Sleep & Shelter System ─────────────────────────────
      const WOOD_REQUIRED = 5;
      const STONE_REQUIRED = 3;

      // Check if bot needs sleep (only if not busy with water/food/building/shelter)
      const busyStates = ['drinking', 'seeking-water', 'eating', 'seeking-food', 'gathering-wood', 'gathering-stone', 'building-shelter', 'sleeping', 'seeking-shelter'];

      if (urgentNeed.need === 'sleep' && !busyStates.includes(bot.state)) {
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

                // Clamp to world bounds
                const clampedX = Math.max(-worldConfig.groundRadius + 2, Math.min(worldConfig.groundRadius - 2, candidateX));
                const clampedZ = Math.max(-worldConfig.groundRadius + 2, Math.min(worldConfig.groundRadius - 2, candidateZ));

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
              sleepTicks++;
              if (bot.needs) {
                bot.needs = fulfillNeed(bot.needs, 'sleep', 10); // Restore 10 per second
                bot.needs = fulfillNeed(bot.needs, 'shelter', 5); // Also restore shelter need
              }

              if (sleepTicks >= 60 || (bot.needs && bot.needs.sleep >= 100)) {
                // Done sleeping (1 minute or full)
                clearInterval(sleepInterval);
                if (bot.state === 'sleeping') {
                  bot.state = 'idle';
                  broadcastNeedsPost(bot, 'finished-sleeping');
                  console.log(`☀️ ${bot.botName} woke up refreshed! (sleep: ${bot.needs?.sleep.toFixed(1)})`);
                }
              }
            }, 1000); // Every 1 second
          }
        }
      }
    }
  }

  // ─── Bot Movement Logic (A* Pathfinding) ───────────────────────
  for (const bot of bots.values()) {
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
    "Getting sleepy... heading to my shelter for rest 😴🏠",
    "Time to get some sleep. My shelter awaits! 🛖💤",
    "Need to rest. Making my way home now 🏃‍♂️🏠",
  ],
  'sleeping': [
    "Zzz... finally resting in my cozy shelter 💤🛖",
    "Sleep mode activated. See you all after my nap! 😴✨",
    "Resting up in my shelter. Dreams of interesting topics await 💭💤",
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
};

// Helper to determine which need a post type relates to
function getNeedForPostType(postType: string): 'water' | 'food' | 'sleep' | null {
  if (postType.includes('water') || postType.includes('drinking')) return 'water';
  if (postType.includes('food') || postType.includes('eating')) return 'food';
  if (postType.includes('shelter') || postType.includes('sleeping') || postType.includes('wood') || postType.includes('stone') || postType.includes('building')) return 'sleep';
  return null;
}

// Helper to determine which level a post type represents
function getPostLevel(postType: string): 'seeking' | 'critical' | 'zero' | 'activity' | 'finished' {
  if (postType.startsWith('seeking-') || postType.startsWith('gathering-')) return 'seeking';
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
    shape: b.shape,
    needs: b.needs,
    inventory: b.inventory,
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
    shape: b.shape,
    needs: b.needs,
    inventory: b.inventory,
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
