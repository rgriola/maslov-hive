/**
 * Visual configuration for bots in 3D scene.
 * Geometry and color are now randomized per-bot at spawn time.
 * Refactored: 2026-02-17 @ random geometry + color
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
 * Get personality emoji + label with fallback.
 */
export function getPersonalityMeta(personality: string): { emoji: string; label: string } {
  return PERSONALITY_META[personality.toLowerCase()] || { emoji: '🤖', label: 'Unknown' };
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
