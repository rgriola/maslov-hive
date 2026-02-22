/**
 * Bot factory utilities — random color, shape, and dimension generation.
 * Extracted from world-physics.ts (Phase 5).
 *
 * Used by the bridge bot-init module to assign visual properties to new bots.
 */

import { BOT_PHYSICS } from '@/config/simulation';

// ─── Color ───────────────────────────────────────────────────────

/**
 * Generate a random web-safe color from the 216-color cube (6×6×6).
 */
export function random256Color(): string {
  const r = Math.floor(Math.random() * 6) * 51; // 0,51,102,153,204,255
  const g = Math.floor(Math.random() * 6) * 51;
  const b = Math.floor(Math.random() * 6) * 51;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Shape ───────────────────────────────────────────────────────

/** Available bot geometry types */
export const BOT_SHAPES = ['box', 'sphere', 'cone', 'cylinder'] as const;
export type BotShape = (typeof BOT_SHAPES)[number];

/** Pick a random geometry shape for a bot */
export function randomBotShape(): BotShape {
  return BOT_SHAPES[Math.floor(Math.random() * BOT_SHAPES.length)];
}

// ─── Dimensions ──────────────────────────────────────────────────

export function randomBotWidth(): number {
  return BOT_PHYSICS.MIN_WIDTH + Math.random() * (BOT_PHYSICS.MAX_WIDTH - BOT_PHYSICS.MIN_WIDTH);
}

export function randomBotHeight(): number {
  return BOT_PHYSICS.MIN_HEIGHT + Math.random() * (BOT_PHYSICS.MAX_HEIGHT - BOT_PHYSICS.MIN_HEIGHT);
}
