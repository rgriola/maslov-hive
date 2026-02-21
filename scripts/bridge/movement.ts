/**
 * Maslov Hive Simulation Bridge
 * orchestrates metabolism, cognitive brain, and physics engines.
 */

import { bots, worldConfig, bridgeState } from './state';
import { tickMetabolism } from './agents/metabolism';
import { tickBrain } from './agents/brain';
import { resolvePhysics } from './physics/solver';
import { broadcastBotPositions } from './broadcast';

let lastTimestamp = Date.now();

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

  // Placeholder for any global environmental shifts
  // bridgeState.currentTemperature += someShift;
}

// Ensure first timestamp is clean
lastTimestamp = Date.now();
export default simulateMovement;
