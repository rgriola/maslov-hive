/**
 * Physics Solver — handles movement, collision resolution, and avoidance.
 * 
 * @module bridge/physics/solver
 */

import { BotState, WorldConfig } from '../../../src/types/simulation';
import { findPath } from '../../../src/lib/pathfinding';
import {
    MOVE_SPEED,
    IDLE_CHANCE,
    AVOIDANCE_RADIUS,
    SIDESTEP_STRENGTH,
    pardonCooldowns,
    greetingTimestamps
} from '../state';
import { broadcastNeedsPost } from '../needs-posts';
import { pickNewTarget } from './navigation';
import { resolveSundialCollision, resolveShelterCollisions } from './geometries';

/**
 * Main physics tick.
 */
export function resolvePhysics(bots: Map<string, BotState>, worldConfig: WorldConfig, dt: number) {
    const botArray = Array.from(bots.values());

    // 1. Move towards targets / follow paths
    for (const bot of botArray) {
        tickBotMovement(bot, bots, worldConfig, dt);
    }

    // 2. Proximity Avoidance & Hard Collisions (Spatial Partitioning)
    resolveBotCollisions(botArray);

    // 3. Structure & Boundary Collisions
    for (const bot of botArray) {
        resolveSundialCollision(bot, worldConfig);
        resolveShelterCollisions(bot, worldConfig);
        clampToWorld(bot, worldConfig);
    }
}

/**
 * Handles individual bot translation and pathfollowing.
 */
function tickBotMovement(bot: BotState, bots: Map<string, BotState>, worldConfig: WorldConfig, dt: number) {
    if (['sleeping', 'coupling', 'speaking'].includes(bot.state)) return;

    const botRadius = bot.width / 2;
    // Scale speed by dt (standardize to 200ms tick)
    const scaledSpeed = MOVE_SPEED * (dt / 200);

    // If no path, either find one or pick new target if reached
    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
        const dx = bot.targetX - bot.x;
        const dz = bot.targetZ - bot.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) {
            bot.path = findPath(bot.x, bot.z, bot.targetX, bot.targetZ, botRadius, worldConfig);
            bot.pathIndex = 0;
        } else {
            // Reached target
            bot.x = bot.targetX;
            bot.z = bot.targetZ;

            // If we were wandering/idle, pick new target
            if (bot.state === 'wandering' || bot.state === 'idle') {
                bot.state = 'idle';
                if (Math.random() > IDLE_CHANCE) {
                    pickNewTarget(bot, bots, worldConfig);
                }
            }
            return;
        }
    }

    // Follow path waypoints
    if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
        const waypoint = bot.path[bot.pathIndex];
        const dx = waypoint.x - bot.x;
        const dz = waypoint.z - bot.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.1) {
            const step = Math.min(scaledSpeed, dist);
            bot.x += (dx / dist) * step;
            bot.z += (dz / dist) * step;

            // ONLY overwrite state if we were idle/wandering
            if (bot.state === 'idle') {
                bot.state = 'wandering';
            }
        } else {
            bot.pathIndex++;
            if (bot.pathIndex >= bot.path.length) {
                bot.path = [];
                bot.pathIndex = 0;

                if (bot.state === 'wandering' || bot.state === 'idle') {
                    bot.state = 'idle';
                    if (Math.random() > IDLE_CHANCE) {
                        pickNewTarget(bot, bots, worldConfig);
                    }
                }
            }
        }
    }
}

/**
 * Resolves bot-to-bot collisions and proximity avoidance.
 * Includes a basic spatial grid for performance.
 */
function resolveBotCollisions(bots: BotState[]) {
    // Spatial Grid (1.5m cells)
    const cellSize = 1.5;
    const grid = new Map<string, BotState[]>();

    for (const bot of bots) {
        const gx = Math.floor(bot.x / cellSize);
        const gz = Math.floor(bot.z / cellSize);
        const key = `${gx},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(bot);
    }

    for (const bot of bots) {
        const gx = Math.floor(bot.x / cellSize);
        const gz = Math.floor(bot.z / cellSize);

        // Check self cell and 8 neighbors
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const neighborBots = grid.get(`${gx + x},${gz + z}`);
                if (!neighborBots) continue;

                for (const other of neighborBots) {
                    if (bot.botId === other.botId) continue;
                    handleBotPairPhysics(bot, other);
                }
            }
        }
    }
}

function handleBotPairPhysics(a: BotState, b: BotState) {
    const cdx = b.x - a.x;
    const cdz = b.z - a.z;
    const centerDist = Math.sqrt(cdx * cdx + cdz * cdz);
    if (centerDist === 0) return;

    const minSep = (a.width + b.width) / 2 + 0.1;

    if (centerDist < minSep) {
        // 1. Hard Collision Push
        const overlap = minSep - centerDist;
        const pushX = (cdx / centerDist) * overlap * 0.5;
        const pushZ = (cdz / centerDist) * overlap * 0.5;

        a.x -= pushX;
        a.z -= pushZ;
        b.x += pushX;
        b.z += pushZ;

        // Reset busy paths on collision
        if (a.state === 'wandering') a.path = [];
        if (b.state === 'wandering') b.path = [];
    } else if (centerDist < AVOIDANCE_RADIUS) {
        // 2. Soft Avoidance (Sidestepping)
        if (a.state !== 'wandering' && b.state !== 'wandering') return;

        const perpX = -cdz / centerDist;
        const perpZ = cdx / centerDist;
        const urgency = 1 - (centerDist - minSep) / (AVOIDANCE_RADIUS - minSep);
        const nudge = SIDESTEP_STRENGTH * urgency;

        if (a.state === 'wandering') {
            a.x += perpX * nudge;
            a.z += perpZ * nudge;
        }
        if (b.state === 'wandering') {
            b.x -= perpX * nudge;
            b.z -= perpZ * nudge;
        }

        // 3. Social: Occasional Greeting
        handleGreeting(a, b);
    }
}

function handleGreeting(a: BotState, b: BotState) {
    const pairKey = a.botId < b.botId ? `${a.botId}:${b.botId}` : `${b.botId}:${a.botId}`;
    const now = Date.now();

    if (!pardonCooldowns.has(pairKey) || now - pardonCooldowns.get(pairKey)! > 15000) {
        if (Math.random() < 0.2) {
            pardonCooldowns.set(pairKey, now);
            const speaker = Math.random() < 0.5 ? a : b;
            const other = speaker === a ? b : a;

            const botGreetings = greetingTimestamps.get(speaker.botId) || [];
            const oneHourAgo = now - 60 * 60 * 1000;
            const recentGreetings = botGreetings.filter((t) => t > oneHourAgo);

            if (recentGreetings.length < 4) {
                recentGreetings.push(now);
                greetingTimestamps.set(speaker.botId, recentGreetings);
                broadcastNeedsPost(speaker, 'greeting', other.botName);
            }
        }
    }
}

function clampToWorld(bot: BotState, worldConfig: WorldConfig) {
    const radius = worldConfig.groundRadius - 0.5;
    const dist = Math.sqrt(bot.x * bot.x + bot.z * bot.z);
    if (dist > radius) {
        bot.x = (bot.x / dist) * radius;
        bot.z = (bot.z / dist) * radius;
    }
}
