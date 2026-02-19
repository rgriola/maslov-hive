/**
 * WebSocket Bridge — Real-time 3D simulation backend for bot movement & state broadcasting
 *
 * Loads bots from DB, simulates autonomous movement with A* pathfinding,
 * manages physical needs (water, food, sleep), and broadcasts state to viewers.
 *
 * Run: npx tsx scripts/websocket-bridge.ts
 *
 * @refactored Feb 18, 2026 — ESLint fixes, type safety improvements
 * @refactored — Split 2,400-line monolith into modules under scripts/bridge/
 */

// MUST load env vars synchronously before any imports that need them
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { WebSocketServer, WebSocket } from 'ws';

import {
  prisma,
  clients,
  bridgeState,
  PORT,
  TICK_INTERVAL,
  POLL_INTERVAL,
} from './bridge/state';
import { fetchWorldWeather } from './bridge/weather';
import { sendWorldInit } from './bridge/broadcast';
import { initializeBots, handleRemoteReset } from './bridge/bot-init';
import { pollForNewPosts, syncLifetimeStats, cleanupDatabase } from './bridge/db-sync';
import { simulateMovement } from './bridge/movement';

// ─── WebSocket Server ────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

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
        case 'sim:speed':
          bridgeState.simSpeedMultiplier = msg.data.speed || 1;
          console.log(`⏩ Simulation speed changed to ${bridgeState.simSpeedMultiplier}x`);
          break;
        case 'sim:reset':
          handleRemoteReset();
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
  await fetchWorldWeather();

  // Start movement simulation using recursive timeout for dynamic speed
  function tick() {
    simulateMovement();
    const nextTick = TICK_INTERVAL / bridgeState.simSpeedMultiplier;
    setTimeout(tick, nextTick);
  }
  tick();

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

// ─── Periodic Database Sync & Cleanup ───────────────────────────

// Stats sync every 5 minutes
const statsSyncInterval = setInterval(syncLifetimeStats, 5 * 60 * 1000);

// Cleanup every hour
const dbCleanupInterval = setInterval(cleanupDatabase, 60 * 60 * 1000);

// Initial cleanup on start
cleanupDatabase();

// ─── Graceful Shutdown ──────────────────────────────────────────

function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  clearInterval(statsSyncInterval);
  clearInterval(dbCleanupInterval);

  wss.close(() => {
    console.log('   ✅ WebSocket server closed');
  });

  wss.clients.forEach((client) => {
    client.close();
  });

  prisma.$disconnect().then(() => {
    console.log('   ✅ Database connection closed');
    process.exit(0);
  }).catch((err) => {
    console.error('   ❌ Error disconnecting Prisma:', err);
    process.exit(1);
  });

  setTimeout(() => {
    console.error('   ⚠️ Forced exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
