/**
 * World Geometry Utilities — structure collisions and positioning.
 * 
 * @module bridge/physics/geometries
 */

import { BotState, WorldConfig } from '../../../src/types/simulation';

/**
 * Resolves collision between a bot and the central sundial.
 */
export function resolveSundialCollision(bot: BotState, worldConfig: WorldConfig) {
    const botRadius = bot.width / 2;
    const sundial = worldConfig.sundial;
    const sdx = bot.x - sundial.x;
    const sdz = bot.z - sundial.z;
    const sundialDist = Math.sqrt(sdx * sdx + sdz * sdz);
    const sundialMinDist = sundial.radius + botRadius;

    if (sundialDist < sundialMinDist && sundialDist > 0.001) {
        const pushDist = sundialMinDist - sundialDist;
        bot.x += (sdx / sundialDist) * pushDist;
        bot.z += (sdz / sundialDist) * pushDist;

        // Help the bot navigate around it
        const tangentX = -sdz / sundialDist;
        const tangentZ = sdx / sundialDist;
        const toTargetX = bot.targetX - bot.x;
        const toTargetZ = bot.targetZ - bot.z;
        const dot = tangentX * toTargetX + tangentZ * toTargetZ;
        const sign = dot >= 0 ? 1 : -1;

        const waypointDist = sundialMinDist + 0.5;
        bot.targetX = sundial.x + (sdx / sundialDist) * waypointDist + sign * tangentX * 2;
        bot.targetZ = sundial.z + (sdz / sundialDist) * waypointDist + sign * tangentZ * 2;
    }
}

/**
 * Resolves collision between a bot and all built shelters.
 */
export function resolveShelterCollisions(bot: BotState, worldConfig: WorldConfig) {
    const botRadius = bot.width / 2;

    for (const shelter of worldConfig.shelters) {
        if (!shelter.built) continue;

        const shelterHalfSize = 0.5;
        const shelterLeft = shelter.x - shelterHalfSize;
        const shelterRight = shelter.x + shelterHalfSize;
        const shelterBack = shelter.z - shelterHalfSize;
        const shelterFront = shelter.z + shelterHalfSize;

        const inX = bot.x > shelterLeft - botRadius && bot.x < shelterRight + botRadius;
        const inZ = bot.z > shelterBack - botRadius && bot.z < shelterFront + botRadius;

        if (inX && inZ) {
            const isOwner = shelter.ownerId === bot.botId;
            const atFrontDoor = bot.z > shelter.z && Math.abs(bot.x - shelter.x) < 0.2;

            // Owners can enter their own shelters if they are seeking shelter or sleeping
            if (isOwner && atFrontDoor && (bot.state === 'seeking-shelter' || bot.state === 'sleeping')) {
                continue;
            }

            const distToLeft = bot.x - shelterLeft;
            const distToRight = shelterRight - bot.x;
            const distToBack = bot.z - shelterBack;
            const distToFront = shelterFront - bot.z;
            const minDist = Math.min(distToLeft, distToRight, distToBack, distToFront);

            const savedTargetX = bot.targetX;
            const savedTargetZ = bot.targetZ;

            if (minDist === distToLeft) {
                bot.x = shelterLeft - botRadius - 0.1;
                if (savedTargetZ > shelter.z) {
                    bot.targetX = shelterLeft - botRadius - 0.3;
                    bot.targetZ = shelterFront + botRadius + 0.5;
                } else {
                    bot.targetX = shelterLeft - botRadius - 0.3;
                    bot.targetZ = shelterBack - botRadius - 0.5;
                }
            } else if (minDist === distToRight) {
                bot.x = shelterRight + botRadius + 0.1;
                if (savedTargetZ > shelter.z) {
                    bot.targetX = shelterRight + botRadius + 0.3;
                    bot.targetZ = shelterFront + botRadius + 0.5;
                } else {
                    bot.targetX = shelterRight + botRadius + 0.3;
                    bot.targetZ = shelterBack - botRadius - 0.5;
                }
            } else if (minDist === distToBack) {
                bot.z = shelterBack - botRadius - 0.1;
                if (savedTargetX > shelter.x) {
                    bot.targetX = shelterRight + botRadius + 0.5;
                    bot.targetZ = shelterBack - botRadius - 0.3;
                } else {
                    bot.targetX = shelterLeft - botRadius - 0.5;
                    bot.targetZ = shelterBack - botRadius - 0.3;
                }
            } else {
                bot.z = shelterFront + botRadius + 0.1;
                if (savedTargetX > shelter.x) {
                    bot.targetX = shelterRight + botRadius + 0.5;
                    bot.targetZ = shelterFront + botRadius + 0.3;
                } else {
                    bot.targetX = shelterLeft - botRadius - 0.5;
                    bot.targetZ = shelterFront + botRadius + 0.3;
                }
            }
        }
    }
}
