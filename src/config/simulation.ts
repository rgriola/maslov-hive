/**
 * Shared configuration constants for the Bot-Talker simulation.
 * Used by both the frontend (React) and backend (Node.js scripts).
 */

// ─── Grid & World ────────────────────────────────────────────────
export const WORLD_CONFIG = {
  // Navigation grid cell size in meters (40cm)
  NAV_GRID_CELL_SIZE: 0.4,
  
  // How much space each bot needs (affects world size)
  SQ_METERS_PER_BOT: 75,
  
  // Minimum side length of the world in meters
  MIN_GROUND_SIZE: 10,
  
  // Distance to stop before reaching a target
  APPROACH_DISTANCE: 2,
};

// ─── Bot Physics ─────────────────────────────────────────────────
export const BOT_PHYSICS = {
  MIN_WIDTH: 0.5,
  MAX_WIDTH: 0.8,
  MIN_HEIGHT: 0.66,
  MAX_HEIGHT: 1.3,
  
  // Movement speed (meters per tick?) - currently logic handled in bridge
  // but limits could be here
  
  // Chance to pause movement (10%)
  IDLE_CHANCE: 0.1,
};

// ─── Resources & Building ────────────────────────────────────────
export const RESOURCE_CONFIG = {
  // Tree count is usually dynamic, but we can set densities here if needed
  TREE_DENSITY: 0.05, // Trees per sq meter (example)
};
