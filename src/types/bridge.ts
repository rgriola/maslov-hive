/**
 * Types shared between the bridge simulation engine (scripts/bridge/) and the client.
 * Re-exported from @/types/simulation — client code should import from there, not here.
 * Refactored: 2026-02-21 — Phase 1 types extraction
 */

import type { BotNeeds, ShelterData } from '@/types/simulation';

// ─── A* Pathfinding Node ──────────────────────────────────────

export interface NavNode {
  x: number;
  z: number;
  g: number;
  h: number;
  f: number;
  parent: NavNode | null;
}

// ─── Full Bot State (server-side) ─────────────────────────────

export interface BotState {
  botId: string;
  isInside?: boolean;
  botName: string;
  personality: string;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  speed?: number;
  width: number;
  height: number;
  color: string;
  shape: string;
  state: string;
  lastPostTitle?: string;
  lastPostTime?: number;
  needs?: BotNeeds;
  lastNeedUpdate?: Date;
  needsPostTracker?: {
    water: { seeking: boolean; critical: boolean; zero: boolean };
    food: { seeking: boolean; critical: boolean; zero: boolean };
    sleep: { seeking: boolean; critical: boolean; zero: boolean };
    air: { seeking: boolean; critical: boolean; zero: boolean };
    clothing: { seeking: boolean; critical: boolean; zero: boolean };
    homeostasis: { seeking: boolean; critical: boolean; zero: boolean };
    reproduction: { seeking: boolean; critical: boolean; zero: boolean };
  };
  lastCriticalPostIds?: {
    water?: string;
    food?: string;
    sleep?: string;
  };
  seeking?: boolean;
  critical?: boolean;
  zero?: boolean;
  couplingPartnerId?: string;
  inventory: {
    wood: number;
    stone: number;
    water: number;
    food: number;
  };
  shelterId?: string;
  helpingTargetId?: string;
  lastHelpPostTime?: number;
  urgentNeed?: string;
  path: Array<{ x: number; z: number }>;
  pathIndex: number;
  operationProgress?: number;

  // Lifetime Metrics
  lifetimeStats: {
    totalWood: number;
    totalStone: number;
    totalWater: number;
    totalFood: number;
    reproductionCount: number;
    childrenCount: number;
    sheltersBuilt: number;
    totalPosts: number;
    totalComments: number;
    totalUpvotes: number;
    totalDownvotes: number;
    waterRefillCount: number;
    foodRefillCount: number;
    helpCount: number;
  };
  spawnDate: Date;
}

// ─── World Configuration (server-side) ────────────────────────

export interface WorldConfig {
  groundRadius: number;
  botCount: number;
  waterSpots: Array<{ x: number; z: number; radius: number }>;
  foodSpots: Array<{ x: number; z: number; radius: number; available: number; maxAvailable: number; growing?: boolean }>;
  woodSpots: Array<{ x: number; z: number; radius: number; available: number; maxAvailable: number; growing?: boolean }>;
  stoneSpots: Array<{ x: number; z: number; radius: number; available: number }>;
  shelters: ShelterData[];
  sundial: { x: number; z: number; radius: number };
  aqi?: number;
}
