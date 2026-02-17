/**
 * Type definitions for the 3D bot simulation page.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

// ─── Weather & Air Quality Types ───────────────────────────────

export interface AirQualityData {
  us_aqi: number;
  european_aqi: number;
  pm10: number;
  pm2_5: number;
  carbon_monoxide: number;
  nitrogen_dioxide: number;
  sulphur_dioxide: number;
  ozone: number;
  quality_label: string;
}

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  condition: string;
  weatherCode: number;
  cloudCover: number;
  precipitation: number;
  humidity: number;
  windSpeed: number;
  isDay: boolean;
  isRaining: boolean;
  isSnowing: boolean;
  isCloudy: boolean;
  isFoggy: boolean;
  isStormy: boolean;
  airQuality?: AirQualityData;
}

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

export interface BotData {
  botId: string;
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
  inventory?: {
    wood: number;
    stone: number;
  };
}

// ─── Backend/Bridge Shared Types ────────────────────────────────

export interface NavNode {
  x: number;
  z: number;
  g: number;
  h: number;
  f: number;
  parent: NavNode | null;
}

export interface BotState {
  botId: string;
  botName: string;
  personality: string;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  speed?: number; // Optional, defaults used in bridge
  width: number;
  height: number;
  color: string;
  shape: string;    // geometry type: 'box' | 'sphere' | 'cone' | 'cylinder'
  state: string; // 'idle' | 'walking' | 'thinking' | 'sleeping'
  lastPostTitle?: string;
  lastPostTime?: number;
  needs?: BotNeeds;
  lastNeedUpdate?: Date;
  needsPostTracker?: {
    water: { seeking: boolean; critical: boolean; zero: boolean };
    food: { seeking: boolean; critical: boolean; zero: boolean };
    sleep: { seeking: boolean; critical: boolean; zero: boolean };
  };
  seeking?: boolean;
  critical?: boolean; // low needs check
  zero?: boolean;     // 0 needs check
  inventory: {
    wood: number;
    stone: number;
  };
  shelterId?: string;
  path: Array<{ x: number; z: number }>;
  pathIndex: number;
}

export interface WorldConfig {
  groundRadius: number;
  botCount: number;
  waterSpots: Array<{ x: number; z: number; radius: number }>;
  foodSpots: Array<{ x: number; z: number; radius: number }>;
  woodSpots: Array<{ x: number; z: number; radius: number; available: number }>;
  stoneSpots: Array<{ x: number; z: number; radius: number; available: number }>;
  shelters: ShelterData[]; // Array for easier iteration/finding
  sundial: { x: number; z: number; radius: number };
}

export interface ShelterData {
  id: string;
  type: string;
  x: number;
  z: number;
  ownerId: string | null;
  built: boolean;
  buildProgress: number; // 0 to 100
}

// ─── Three.js Bot Entity ───────────────────────────────────────

import * as THREE from 'three';

export interface BotEntity {
  group: THREE.Group;
  mesh: THREE.Mesh;
  label: HTMLDivElement;
  speechBubble: HTMLDivElement;
  targetPos: THREE.Vector3;
  data: BotData;
  postCount: number;
  recentPost?: ActivityMessage;
}

// ─── Activity & Posts ─────────────────────────────────────────

export interface ActivityMessage {
  id: string;
  postId?: string;
  botName: string;
  botColor: string;
  text: string;
  content: string;
  time: string;
}

export interface PostComment {
  id: string;
  content: string;
  createdAt: string;
  agent: { name: string };
}

export interface PostDetail {
  comments: PostComment[];
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
  inventory?: {
    wood: number;
    stone: number;
  };
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
