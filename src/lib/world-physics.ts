/**
 * Collision detection — checks whether a world position is walkable.
 * Bot factory utils moved to src/lib/bot-factory.ts (Phase 5).
 * detectPersonality moved to src/config/bot-visuals.ts (Phase 5).
 */

import { WorldConfig } from '@/types/simulation';

/**
 * Check if a world position is walkable (not blocked by obstacles).
 */
export function isWalkable(x: number, z: number, botRadius: number, config: WorldConfig): boolean {
    const padding = botRadius + 0.15;

    // Check sundial collision
    const sundial = config.sundial;
    const toSundialX = x - sundial.x;
    const toSundialZ = z - sundial.z;
    const sundialDist = Math.sqrt(toSundialX * toSundialX + toSundialZ * toSundialZ);
    if (sundialDist < sundial.radius + padding) {
        return false;
    }

    // Check shelter collisions
    for (const shelter of config.shelters) {
        if (!shelter.built) continue;
        const shelterHalfSize = 0.5;
        const inX = x > shelter.x - shelterHalfSize - padding && x < shelter.x + shelterHalfSize + padding;
        const inZ = z > shelter.z - shelterHalfSize - padding && z < shelter.z + shelterHalfSize + padding;
        if (inX && inZ) {
            return false;
        }
    }

    // Check world bounds
    const bound = config.groundRadius - 0.5;
    if (Math.abs(x) > bound || Math.abs(z) > bound) {
        return false;
    }

    return true;
}
