/**
 * Maslov Hive Simulation Bridge
 * orchestrates metabolism, cognitive brain, and physics engines.
 */

import { bots, worldConfig, bridgeState, WOOD_REQUIRED } from './state';
import { tickMetabolism } from './agents/metabolism';
import { tickBrain } from './agents/brain';
import { resolvePhysics } from './physics/solver';
import { broadcastBotPositions } from './broadcast';

let lastTimestamp = Date.now();

// Resource regrowth system
let resourceGrowAccumulator = 0;
let foodRespawnTimer = -1;                       // -1 = inactive, >= 0 = counting sim-ms until spawn
const RESOURCE_GROW_INTERVAL = 1 * 60 * 1000;   // tick every 1 simulated minute
const FOOD_RESPAWN_DELAY = 1 * 60 * 1000;       // 1 sim-minute delay before new food sprouts
const WOOD_GROW_DURATION = 20 * 60 * 1000;      // 20 min to fully grow wood
const FOOD_GROW_DURATION = 15 * 60 * 1000;      // 15 min to fully grow food
const FOOD_PER_SPOT = 2;                         // enough for 2 bots

/**
 * Main simulation loop called by the websocket bridge.
 */
export function simulateMovement() {
  const now = Date.now();
  // Calculate real elapsed time, then scale by simulation speed
  const realDt = now - lastTimestamp;
  const dt = realDt * bridgeState.simSpeedMultiplier;
  lastTimestamp = now;

  // 1. Central Weather/State updates
  updateWorldState(dt);

  // 2. Individual Bot Ticks (Metabolism & Cognitive)
  for (const bot of bots.values()) {
    // Metabolism: life support, needs decay/recovery
    tickMetabolism(bot, dt);

    // Cognitive: decision making, state transitions, behaviors
    tickBrain(bot, dt);
  }

  // 3. Physics & Resolution (Movement, Collisions, Boundaries)
  resolvePhysics(bots, worldConfig, dt);

  // 4. Broadcast updated state to all clients
  broadcastBotPositions();
}

/**
 * Updates global simulation state factors
 */
function updateWorldState(dt: number) {
  // Pass time in worldConfig if needed
  if (!worldConfig.aqi) worldConfig.aqi = 50;

  const innerRadius = 2.9;
  const outerRadius = worldConfig.groundRadius;

  // ── Food depletion detection (runs every tick for responsiveness) ──
  const allFoodDepleted = worldConfig.foodSpots.every(f => f.available <= 0 && !f.growing);
  if (allFoodDepleted && foodRespawnTimer < 0) {
    foodRespawnTimer = 0;
    console.log(`🕐 All food consumed — new food spot will sprout in 1 minute...`);
  }
  if (foodRespawnTimer >= 0) {
    foodRespawnTimer += dt;
    if (foodRespawnTimer >= FOOD_RESPAWN_DELAY) {
      foodRespawnTimer = -1;
      // Remove old depleted (non-growing) spots
      worldConfig.foodSpots = worldConfig.foodSpots.filter(f => f.growing || f.available > 0);
      // Spawn new food spot
      spawnNewFoodSpot(innerRadius, outerRadius);
    }
  }

  // Resource regrowth — gradual growth on 1 sim-minute ticks
  resourceGrowAccumulator += dt;
  if (resourceGrowAccumulator >= RESOURCE_GROW_INTERVAL) {
    const growTicks = Math.floor(resourceGrowAccumulator / RESOURCE_GROW_INTERVAL);
    resourceGrowAccumulator -= growTicks * RESOURCE_GROW_INTERVAL;

    // ── Food growth ──
    const foodGrowPerTick = FOOD_PER_SPOT / (FOOD_GROW_DURATION / RESOURCE_GROW_INTERVAL);
    for (const food of worldConfig.foodSpots) {
      if (food.growing && food.available < food.maxAvailable) {
        food.available = Math.min(food.maxAvailable, food.available + foodGrowPerTick * growTicks);
        console.log(`🌽 Food growing: ${food.available.toFixed(1)}/${food.maxAvailable}`);
        if (food.available >= food.maxAvailable) {
          food.available = food.maxAvailable;
          food.growing = false;
          console.log(`🌾 Food fully grown at (${food.x.toFixed(1)}, ${food.z.toFixed(1)})!`);
        }
      }
    }

    // ── Wood regrowth ──
    const woodDepleted = worldConfig.woodSpots.every(w => w.available <= 1 && !w.growing);
    if (woodDepleted) {
      const MIN_GAP_W = 1;
      let spawnWX = 0, spawnWZ = 0;
      let foundW = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const minDist = innerRadius + 2.5;
        const maxDist = outerRadius - 2;
        const dist = minDist + Math.random() * (maxDist - minDist);
        const cx = Math.cos(angle) * dist;
        const cz = Math.sin(angle) * dist;

        const obstacles = [
          { x: worldConfig.sundial.x, z: worldConfig.sundial.z, r: worldConfig.sundial.radius },
          ...worldConfig.waterSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
          ...worldConfig.foodSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
          ...worldConfig.stoneSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
          ...worldConfig.woodSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
          ...worldConfig.shelters.map(s => ({ x: s.x, z: s.z, r: 1.0 })),
        ];
        const tooClose = obstacles.some(o => {
          const dx = cx - o.x;
          const dz = cz - o.z;
          return Math.sqrt(dx * dx + dz * dz) < 2.5 + o.r + MIN_GAP_W;
        });
        if (!tooClose) {
          spawnWX = cx;
          spawnWZ = cz;
          foundW = true;
          break;
        }
      }
      if (!foundW) {
        const angle = Math.random() * Math.PI * 2;
        const dist = (innerRadius + outerRadius) / 2;
        spawnWX = Math.cos(angle) * dist;
        spawnWZ = Math.sin(angle) * dist;
      }
      const newSpot = {
        x: spawnWX,
        z: spawnWZ,
        radius: 2.5,
        available: 0,
        maxAvailable: WOOD_REQUIRED,
        growing: true,
      };
      worldConfig.woodSpots.push(newSpot);
      console.log(`🌱 New wood spot sprouting at (${spawnWX.toFixed(1)}, ${spawnWZ.toFixed(1)}) — will take 20 min to grow`);
    }

    const woodGrowPerTick = WOOD_REQUIRED / (WOOD_GROW_DURATION / RESOURCE_GROW_INTERVAL);
    for (const wood of worldConfig.woodSpots) {
      if (wood.growing && wood.available < wood.maxAvailable) {
        wood.available = Math.min(wood.maxAvailable, wood.available + woodGrowPerTick * growTicks);
        console.log(`🌲 Wood spot growing: ${wood.available.toFixed(1)}/${wood.maxAvailable}`);
        if (wood.available >= wood.maxAvailable) {
          wood.available = wood.maxAvailable;
          wood.growing = false;
          console.log(`🌳 Wood spot fully grown at (${wood.x.toFixed(1)}, ${wood.z.toFixed(1)})!`);
        }
      }
    }
  }
}

/**
 * Spawn a new food spot at a collision-checked random position.
 */
function spawnNewFoodSpot(innerRadius: number, outerRadius: number) {
  const MIN_GAP = 1;
  let spawnX = 0, spawnZ = 0;
  let found = false;

  for (let attempt = 0; attempt < 100; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const minDist = innerRadius + 1.5;
    const maxDist = outerRadius - 1.5;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;

    const obstacles = [
      { x: worldConfig.sundial.x, z: worldConfig.sundial.z, r: worldConfig.sundial.radius },
      ...worldConfig.waterSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
      ...worldConfig.woodSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
      ...worldConfig.stoneSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
      ...worldConfig.foodSpots.map(s => ({ x: s.x, z: s.z, r: s.radius })),
      ...worldConfig.shelters.map(s => ({ x: s.x, z: s.z, r: 1.0 })),
    ];
    const tooClose = obstacles.some(o => {
      const dx = cx - o.x;
      const dz = cz - o.z;
      return Math.sqrt(dx * dx + dz * dz) < 1.5 + o.r + MIN_GAP;
    });
    if (!tooClose) {
      spawnX = cx;
      spawnZ = cz;
      found = true;
      break;
    }
  }

  if (!found) {
    const water = worldConfig.waterSpots[0];
    const awayAngle = Math.atan2(-(water?.z ?? 0), -(water?.x ?? 0));
    const dist = (innerRadius + outerRadius) / 2;
    spawnX = Math.cos(awayAngle) * dist;
    spawnZ = Math.sin(awayAngle) * dist;
    console.warn(`   ⚠️ Food fallback: placed opposite water at (${spawnX.toFixed(1)}, ${spawnZ.toFixed(1)})`);
  }

  worldConfig.foodSpots.push({
    x: spawnX,
    z: spawnZ,
    radius: 1.5,
    available: 0,
    maxAvailable: FOOD_PER_SPOT,
    growing: true,
  });
  console.log(`🌱 New food spot sprouting at (${spawnX.toFixed(1)}, ${spawnZ.toFixed(1)}) — will take 15 min to grow`);
}

// Ensure first timestamp is clean
lastTimestamp = Date.now();
export default simulateMovement;
