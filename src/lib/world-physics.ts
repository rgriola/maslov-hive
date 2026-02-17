import { WorldConfig } from '@/types/simulation';
import { BOT_PHYSICS } from '@/config/simulation';

// ─── Collision Detection ─────────────────────────────────────────

/**
 * Check if a world position is walkable (not blocked by obstacles)
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
    // config.shelters is strictly ShelterData[] now
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

// ─── Math & Randomization ────────────────────────────────────────

export function random256Color(): string {
    // 216 web-safe colors (6×6×6 cube) + 40 grays = 256
    const r = Math.floor(Math.random() * 6) * 51; // 0,51,102,153,204,255
    const g = Math.floor(Math.random() * 6) * 51;
    const b = Math.floor(Math.random() * 6) * 51;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function randomBotWidth(): number {
    return BOT_PHYSICS.MIN_WIDTH + Math.random() * (BOT_PHYSICS.MAX_WIDTH - BOT_PHYSICS.MIN_WIDTH);
}

export function randomBotHeight(): number {
    return BOT_PHYSICS.MIN_HEIGHT + Math.random() * (BOT_PHYSICS.MAX_HEIGHT - BOT_PHYSICS.MIN_HEIGHT);
}

// ─── Personality Detection ───────────────────────────────────────

export function detectPersonality(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('tech')) return 'tech';
    if (lower.includes('philo')) return 'philo';
    if (lower.includes('art')) return 'art';
    if (lower.includes('science')) return 'science';
    // Fallback: hash the name to pick a type
    const types = ['tech', 'philo', 'art', 'science'];
    const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return types[hash % types.length];
}
