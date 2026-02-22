/**
 * UI-facing type definitions for the 3D bot simulation.
 * Split: 2026-02-21 — Phase 1 types extraction
 *
 * Types have been separated by concern:
 *   @/types/weather  — WeatherData, AirQualityData
 *   @/types/scene    — BotEntity (Three.js-coupled)
 *   @/types/bridge   — NavNode, BotState, WorldConfig (shared client + bridge)
 *   @/types/post     — Post, PostComment, Agent (shared across pages)
 *   @/types/simulation — (this file) UI-facing simulation types
 */

// Re-export split types so existing imports continue to work
export type { AirQualityData, WeatherData } from '@/types/weather';
export type { BotEntity } from '@/types/scene';
export type { NavNode, BotState, WorldConfig } from '@/types/bridge';
export type { PostComment } from '@/types/post';

// ─── Bot Needs (Maslow's Hierarchy) ───────────────────────────

export interface BotNeeds {
  water: number;
  food: number;
  sleep: number;
  air: number;
  shelter: number;
  clothing: number;
  homeostasis: number;
  reproduction: number;
}

// ─── Bot Data Types ───────────────────────────────────────────

export interface NearbyBotInfo {
  botId: string;
  botName: string;
  distance: number;
  urgentNeed?: string; // emoji of their most urgent need
}

export interface BotData {
  botId: string;
  isInside?: boolean; // Whether the bot is hidden inside a building
  botName: string;
  personality: string;
  x: number;
  y: number;
  z: number;
  state: string;
  lastPostTitle?: string;
  width?: number;   // 0.5–0.8m (from WebSocket bridge)
  height?: number;  // 0.66–1.3m (from WebSocket bridge)
  color?: string;   // hex color (from WebSocket bridge)
  shape?: string;   // geometry type: 'box' | 'sphere' | 'cone' | 'cylinder'
  needs?: BotNeeds;
  urgentNeed?: string;      // emoji for most urgent need (e.g. 💧)
  awareness?: NearbyBotInfo[]; // bots within 2m
  inventory?: {
    wood: number;
    stone: number;
    water?: number; // max 5
    food?: number;  // max 3
  };
  lifetimeStats?: {
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
  spawnDate?: string; // ISO date string
}

// ─── Shelter Data ─────────────────────────────────────────────

export interface ShelterData {
  id: string;
  type: string;
  x: number;
  z: number;
  ownerId: string | null;
  ownerName?: string;
  ownerColor?: string;
  built: boolean;
  buildProgress: number; // 0 to 100
  isOccupied?: boolean;
}

// ─── Activity & Posts ─────────────────────────────────────────

export interface ActivityMessage {
  id: string;
  postId?: string;
  commentId?: string; // If this is a comment
  parentId?: string; // If this is a reply to another post/comment
  botName: string;
  botColor: string;
  text: string;
  content: string;
  time: string;
}

export interface PostDetail {
  comments: import('@/types/post').PostComment[];
  score: number;
  upvotes: number;
  downvotes: number;
  commentCount: number;
}

// ─── UI State Types ───────────────────────────────────────────

export interface SelectedBotInfo {
  botId: string;
  botName: string;
  personality: string;
  postCount: number;
  color: string;
  state: string;
  height?: number;
  lastPostTime?: string;
  needs?: BotNeeds;
  urgentNeed?: string;
  awareness?: NearbyBotInfo[];
  inventory?: {
    wood: number;
    stone: number;
    water?: number;
    food?: number;
  };
  lifetimeStats?: {
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
  spawnDate?: string;
}

export interface UiTheme {
  panelBg: string;
  panelBgHex: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  cardBg: string;
  cardBgHover: string;
  dayFactor: number;
}
