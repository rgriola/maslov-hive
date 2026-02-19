/**
 * Bridge Shared State — Centralized mutable state for the WebSocket bridge.
 * All modules import from here to avoid circular dependencies.
 *
 * @module bridge/state
 */

import { WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';
import { BotState, WorldConfig } from '../../src/types/simulation';
import { WORLD_CONFIG, BOT_PHYSICS } from '../../src/config/simulation';
import { BotAgent } from '../bot-agent-base';
import { PrismaConnector } from '../connectors/prisma-connector';

// ─── Database ────────────────────────────────────────────────────
export const prisma = new PrismaClient();

// ─── World State ─────────────────────────────────────────────────
export const bots = new Map<string, BotState>();
export const clients = new Set<WebSocket>();

export const worldConfig: WorldConfig = {
  groundRadius: 15,
  botCount: 0,
  waterSpots: [],
  foodSpots: [],
  woodSpots: [],
  stoneSpots: [],
  shelters: [],
  sundial: { x: 0, z: 0, radius: 0.8 },
};

// ─── Cooldown Maps ───────────────────────────────────────────────
export const pardonCooldowns = new Map<string, number>();
export const greetingTimestamps = new Map<string, number[]>();
export const sharingCooldowns = new Map<string, number>();

// ─── AI Agent State ──────────────────────────────────────────────
export const agentInstances = new Map<string, BotAgent>();
export const agentLastHeartbeat = new Map<string, number>();

// Mutable scalars wrapped in object for cross-module mutation
export const bridgeState = {
  agentConnector: null as PrismaConnector | null,
  lastPollTime: new Date(),
  simSpeedMultiplier: 1,
  currentTemperature: 20,
  currentAQI: 25,
};

// ─── Constants ───────────────────────────────────────────────────
export const ENABLE_AI_AGENTS = process.env.ENABLE_AI_AGENTS !== 'false';
export const PORT = parseInt(process.env.PORT || '8080', 10);

// Movement
export const MOVE_SPEED = 0.1;
export const WANDER_RADIUS = 5;
export const TICK_INTERVAL = 200;
export const POLL_INTERVAL = 5000;

// Physics from config
export const IDLE_CHANCE = BOT_PHYSICS.IDLE_CHANCE;
export const APPROACH_DISTANCE = WORLD_CONFIG.APPROACH_DISTANCE;
export const SQ_METERS_PER_BOT = WORLD_CONFIG.SQ_METERS_PER_BOT;
export const MIN_GROUND_SIZE = WORLD_CONFIG.MIN_GROUND_SIZE;

// Building
export const WOOD_REQUIRED = 15;
export const STONE_REQUIRED = 10;

// Collision
export const AVOIDANCE_RADIUS = 1.5;
export const SIDESTEP_STRENGTH = 0.12;
