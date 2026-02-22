'use client';
/**
 * Visual configuration and personality detection for bots.
 * Geometry and color are randomized per-bot at spawn time.
 * `detectPersonality` moved here from world-physics.ts (Phase 5).
 */

import * as THREE from 'three';

/**
 * Personality emoji + label lookup. Used for bot labels and UI.
 */
export const PERSONALITY_META: Record<string, { emoji: string; label: string }> = {
  tech: { emoji: '🤖', label: 'Tech' },
  philo: { emoji: '🧠', label: 'Philosophy' },
  art: { emoji: '🎨', label: 'Art' },
  science: { emoji: '🔬', label: 'Science' },
  pirate: { emoji: '🏴‍☠️', label: 'Pirate' },
};

/**
 * Map full bot names (e.g. "TechBot") to short personality keys.
 * Used by bot profile and other pages that know the agent name but not the personality ID.
 */
const BOT_NAME_TO_KEY: Record<string, string> = {
  TechBot: 'tech',
  PhilosopherBot: 'philo',
  ArtBot: 'art',
  ScienceBot: 'science',
  PirateBot: 'pirate',
};

/**
 * Get personality emoji + label with fallback.
 * Accepts either a short key ("tech") or full bot name ("TechBot").
 */
export function getPersonalityMeta(nameOrKey: string): { emoji: string; label: string } {
  // Try short key first
  const direct = PERSONALITY_META[nameOrKey.toLowerCase()];
  if (direct) return direct;

  // Try full bot name mapping
  const key = BOT_NAME_TO_KEY[nameOrKey];
  if (key) return PERSONALITY_META[key];

  return { emoji: '🤖', label: 'Unknown' };
}

/**
 * Detect a bot's personality type from its name.
 * Looks for known keywords; falls back to a deterministic hash.
 * Moved from world-physics.ts (Phase 5).
 */
export function detectPersonality(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('tech')) return 'tech';
  if (lower.includes('philo')) return 'philo';
  if (lower.includes('art')) return 'art';
  if (lower.includes('science')) return 'science';
  if (lower.includes('pirate')) return 'pirate';
  // Fallback: hash the name to pick a type
  const types = ['tech', 'philo', 'art', 'science', 'pirate'];
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return types[hash % types.length];
}

/**
 * Create a Three.js geometry from a shape name and bot dimensions.
 * Shape is assigned randomly by the server; the client just renders it.
 *
 * @param shape - 'box' | 'sphere' | 'cone' | 'cylinder'
 * @param width - Bot width (e.g. 0.5–0.8m)
 * @param height - Bot height (e.g. 0.66–1.3m)
 */
export function createBotGeometry(
  shape: string | undefined,
  width: number,
  height: number,
): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(Math.max(width, height) * 0.55, 32, 32);
    case 'cone':
      return new THREE.ConeGeometry(width * 0.65, height, 8);
    case 'cylinder':
      return new THREE.CylinderGeometry(width * 0.5, width * 0.5, height, 16);
    case 'box':
    default:
      return new THREE.BoxGeometry(width, height, width);
  }
}
