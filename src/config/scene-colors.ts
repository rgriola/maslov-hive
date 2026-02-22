/**
 * Named color constants for 3D scene objects.
 * Centralizes the hex color values used across scene-objects.ts, shelter-mesh.ts, and useSimulation.ts.
 *
 * Colors use the 0x format expected by Three.js MeshStandardMaterial.
 * For CSS/HTML contexts, use the CSS custom properties in globals.css instead.
 */

// ─── Terrain ─────────────────────────────────────────────────────
export const GROUND_COLOR = 0x2d8c3c;
export const GRID_LINE_COLOR = 0x1a6b2a;
export const GRID_CENTER_COLOR = 0x238636;
export const DIRT_BROWN = 0x5c4033;
export const DIRT_DARK = 0x654321;

// ─── Water ───────────────────────────────────────────────────────
export const WATER_COLOR = 0x2196f3;

// ─── Vegetation ──────────────────────────────────────────────────
export const STALK_GREEN = 0x228b22;
export const FOLIAGE_GREEN = 0x228b22;
export const LEAF_GREEN = 0x32cd32;
export const CORN_GOLD = 0xffd700;

// ─── Wood & Shelter ──────────────────────────────────────────────
export const TRUNK_BROWN = 0x8b4513;
export const SHELTER_FLOOR = 0x8b4513;
export const SHELTER_WALL = 0xa0522d;
export const SHELTER_ROOF = 0x654321;
export const MAILBOX_POST = 0x4a2c1d;
export const MAILBOX_FLAG = 0xff0000;

// ─── Stone & Rock ────────────────────────────────────────────────
export const ROCK_GRAY = 0x808080;
export const GRAVEL_GRAY = 0x696969;
export const FOUNDATION_GRAY = 0x808080;

// ─── Sundial ─────────────────────────────────────────────────────
export const SUNDIAL_BASE = 0x8b8b83;
export const SUNDIAL_DIAL = 0xf5f5dc;
export const SUNDIAL_MARKING = 0x333333;
export const SUNDIAL_BRONZE = 0xcd7f32;
export const SUNDIAL_RING = 0x4a4a4a;

// ─── Build Plot ──────────────────────────────────────────────────
export const PLOT_TAN = 0x8b7355;

// ─── Scene Lighting ──────────────────────────────────────────────
export const SKY_BLUE = 0x87ceeb;
export const AMBIENT_NIGHT = 0x334466;
export const MOONLIGHT = 0x8899bb;
export const ACCENT_BLUE_3D = 0x4a9eff;
export const ACCENT_PURPLE_3D = 0xb366ff;
export const CLOUD_GRAY = 0x6699cc;
