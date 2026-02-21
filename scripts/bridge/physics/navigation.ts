/**
 * Navigation Utilities — target picking and build spot finding.
 * 
 * @module bridge/physics/navigation
 */

import { BotState, WorldConfig } from '../../../src/types/simulation';
import { APPROACH_DISTANCE, WANDER_RADIUS } from '../state';

/**
 * Picks a new target for a bot to wander toward.
 */
export function pickNewTarget(bot: BotState, bots: Map<string, BotState>, worldConfig: WorldConfig) {
    const radius = worldConfig.groundRadius - 0.5;

    // 30% chance: approach another bot
    if (Math.random() < 0.3) {
        const otherBots = Array.from(bots.values()).filter((b) => b.botId !== bot.botId);
        if (otherBots.length > 0) {
            const target = otherBots[Math.floor(Math.random() * otherBots.length)];
            const angle = Math.atan2(bot.z - target.z, bot.x - target.x);
            bot.targetX = target.x + Math.cos(angle) * APPROACH_DISTANCE;
            bot.targetZ = target.z + Math.sin(angle) * APPROACH_DISTANCE;
            bot.state = 'approaching';
            bot.path = [];
            bot.pathIndex = 0;
            return;
        }
    }

    // Otherwise: wander randomly
    const angle = Math.random() * Math.PI * 2;
    const wanderDist = 2 + Math.random() * WANDER_RADIUS;
    bot.targetX = bot.x + Math.cos(angle) * wanderDist;
    bot.targetZ = bot.z + Math.sin(angle) * wanderDist;

    const clampDist = Math.sqrt(bot.targetX * bot.targetX + bot.targetZ * bot.targetZ);
    if (clampDist > radius) {
        bot.targetX = (bot.targetX / clampDist) * radius;
        bot.targetZ = (bot.targetZ / clampDist) * radius;
    }

    bot.state = 'wandering';
    bot.path = [];
    bot.pathIndex = 0;
}

/**
 * Finds a valid spot to build a shelter that doesn't conflict with resources or other structures.
 */
export function findValidBuildSpot(bot: BotState, worldConfig: WorldConfig): { x: number; z: number } | null {
    for (let attempt = 0; attempt < 50; attempt++) {
        const candidateX = (Math.random() - 0.5) * 12;
        const candidateZ = (Math.random() - 0.5) * 12;

        let isValid = true;
        const minDistance = 2;

        // Check resources
        const resources = [
            ...worldConfig.waterSpots,
            ...worldConfig.foodSpots,
            ...worldConfig.woodSpots,
            ...worldConfig.stoneSpots
        ];

        for (const res of resources) {
            const dist = Math.sqrt(Math.pow(candidateX - res.x, 2) + Math.pow(candidateZ - res.z, 2));
            if (dist < res.radius + minDistance) {
                isValid = false;
                break;
            }
        }

        // Check other shelters
        if (isValid) {
            for (const shelter of worldConfig.shelters) {
                const dist = Math.sqrt(Math.pow(candidateX - shelter.x, 2) + Math.pow(candidateZ - shelter.z, 2));
                if (dist < 1.2) {
                    isValid = false;
                    break;
                }
            }
        }

        // Check Sundial
        if (isValid && worldConfig.sundial) {
            const distToSundial = Math.sqrt(
                Math.pow(candidateX - worldConfig.sundial.x, 2) +
                Math.pow(candidateZ - worldConfig.sundial.z, 2)
            );
            if (distToSundial < worldConfig.sundial.radius + 2.0) {
                isValid = false;
            }
        }

        if (isValid) {
            const clampedX = Math.max(-worldConfig.groundRadius + 0.5, Math.min(worldConfig.groundRadius - 0.5, candidateX));
            const clampedZ = Math.max(-worldConfig.groundRadius + 0.5, Math.min(worldConfig.groundRadius - 0.5, candidateZ));
            console.log(`🛖 Building shelter at (${clampedX.toFixed(1)}, ${clampedZ.toFixed(1)})`);
            bot.lifetimeStats.sheltersBuilt++;
            return { x: clampedX, z: clampedZ };
        }
    }

    return null;
}
