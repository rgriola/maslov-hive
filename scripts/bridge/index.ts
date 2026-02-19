/**
 * Bridge barrel export — re-exports all bridge modules for convenient imports.
 *
 * @module bridge/index
 */

export { prisma, bots, clients, worldConfig, bridgeState, TICK_INTERVAL, POLL_INTERVAL, PORT } from './state';
export { fetchWorldWeather } from './weather';
export { createNeedsTracker, createLifetimeStats } from './helpers';
export { broadcast, broadcastBotPositions, sendWorldInit, computeBotExtras } from './broadcast';
export { broadcastNeedsPost, NEEDS_POSTS } from './needs-posts';
export { initializeBots, handleRemoteReset } from './bot-init';
export { startAgentHeartbeats } from './agents';
export { pollForNewPosts, syncLifetimeStats, cleanupDatabase } from './db-sync';
export { simulateMovement, pickNewTarget } from './movement';
