/**
 * Behavior Handlers — modular logic for specific bot states.
 * 
 * @module bridge/agents/behavior-handlers
 */

import { BotState, WorldConfig, ShelterData } from '../../../src/types/simulation';
import { fulfillNeed } from '../../bot-needs';
import {
    WOOD_REQUIRED,
    STONE_REQUIRED,
    prisma,
    bots
} from '../state';
import { broadcastNeedsPost } from '../needs-posts';

export interface BehaviorHandler {
    onEnter?: (bot: BotState) => void;
    onUpdate: (bot: BotState, worldConfig: WorldConfig, dt: number) => void;
    onExit?: (bot: BotState) => void;
}

/**
 * Common logic for duration-based recovery actions (Drinking, Eating).
 */
function handleRecoveryTick(
    bot: BotState,
    dt: number,
    durationMs: number,
    needType: 'water' | 'food',
    recoveryPerTick: number,
    invItem: 'water' | 'food',
    maxInv: number,
    refillStat: 'waterRefillCount' | 'foodRefillCount',
    finishType: 'finished-drinking' | 'finished-eating'
) {
    if (!bot.operationProgress) bot.operationProgress = 0;
    bot.operationProgress += dt;

    const secondsPassed = Math.floor(bot.operationProgress / 1000);
    const previouslyHandledSeconds = Math.floor((bot.operationProgress - dt) / 1000);

    // Every second, restore some needs and potentially refill inventory
    if (secondsPassed > previouslyHandledSeconds) {
        if (bot.needs) {
            if (bot.needs[needType] < 100) {
                bot.needs = fulfillNeed(bot.needs, needType, recoveryPerTick);
            } else if (bot.inventory[invItem] < maxInv) {
                if (secondsPassed % 2 === 0) {
                    bot.inventory[invItem]++;
                    bot.lifetimeStats[refillStat]++;
                    console.log(`🍶 ${bot.botName} collected ${invItem} +1 (Inv: ${bot.inventory[invItem]})`);
                }
            }
        }
    }

    if (bot.operationProgress >= durationMs) {
        if (bot.needs) bot.needs = fulfillNeed(bot.needs, needType, 100);
        bot.state = 'idle';
        bot.operationProgress = 0;
        broadcastNeedsPost(bot, finishType);
        console.log(`✅ ${bot.botName} finished ${needType} (Inv: ${bot.inventory[invItem]})`);
    }
}

export const BehaviorHandlers: Record<string, BehaviorHandler> = {
    drinking: {
        onEnter: (bot) => {
            bot.operationProgress = 0;
            broadcastNeedsPost(bot, 'drinking');
            console.log(`🍶 ${bot.botName} is drinking!`);
        },
        onUpdate: (bot, worldConfig, dt) => {
            handleRecoveryTick(bot, dt, 20000, 'water', 5, 'water', 5, 'waterRefillCount', 'finished-drinking');
        }
    },

    eating: {
        onEnter: (bot) => {
            bot.operationProgress = 0;
            broadcastNeedsPost(bot, 'eating');
            console.log(`🍴 ${bot.botName} is eating!`);
        },
        onUpdate: (bot, worldConfig, dt) => {
            handleRecoveryTick(bot, dt, 20000, 'food', 5, 'food', 3, 'foodRefillCount', 'finished-eating');
        }
    },

    'gathering-wood': {
        onUpdate: (bot, worldConfig) => {
            const wood = worldConfig.woodSpots[0];
            const dist = Math.sqrt(Math.pow(bot.x - wood.x, 2) + Math.pow(bot.z - wood.z, 2));

            if (dist < wood.radius && wood.available > 0) {
                bot.inventory.wood++;
                bot.lifetimeStats.totalWood++;
                wood.available--;
                console.log(`🪵 ${bot.botName} gathered wood (${bot.inventory.wood}/${WOOD_REQUIRED})`);

                if (bot.inventory.wood >= WOOD_REQUIRED) {
                    bot.state = 'idle';
                }
            } else if (dist >= wood.radius) {
                // If we drifted out, or target changed, brain will handle it
                bot.state = 'idle';
            }
        }
    },

    'gathering-stone': {
        onUpdate: (bot, worldConfig) => {
            const stone = worldConfig.stoneSpots[0];
            const dist = Math.sqrt(Math.pow(bot.x - stone.x, 2) + Math.pow(bot.z - stone.z, 2));

            if (dist < stone.radius && stone.available > 0) {
                bot.inventory.stone++;
                bot.lifetimeStats.totalStone++;
                stone.available--;
                console.log(`🪨 ${bot.botName} gathered stone (${bot.inventory.stone}/${STONE_REQUIRED})`);

                if (bot.inventory.stone >= STONE_REQUIRED) {
                    bot.state = 'idle';
                }
            } else if (dist >= stone.radius) {
                bot.state = 'idle';
            }
        }
    },

    'building-shelter': {
        onUpdate: (bot, worldConfig, dt) => {
            const shelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && !s.built);
            if (!shelter) { bot.state = 'idle'; return; }

            const dist = Math.sqrt(Math.pow(bot.x - shelter.x, 2) + Math.pow(bot.z - shelter.z, 2));
            if (dist < 1.5) {
                if (!bot.operationProgress) bot.operationProgress = 0;
                bot.operationProgress += dt;

                if (bot.operationProgress >= 800) {
                    shelter.buildProgress += 1;
                    bot.operationProgress = 0;

                    prisma.shelter.update({
                        where: { id: shelter.id },
                        data: { buildProgress: shelter.buildProgress }
                    }).catch(err => console.error('DB Update Error:', err));

                    if (shelter.buildProgress >= 100) {
                        shelter.built = true;
                        bot.inventory.wood -= WOOD_REQUIRED;
                        bot.inventory.stone -= STONE_REQUIRED;
                        bot.state = 'idle';
                        broadcastNeedsPost(bot, 'finished-building');
                        console.log(`🏠 ${bot.botName} finished building shelter!`);

                        prisma.shelter.update({
                            where: { id: shelter.id },
                            data: { built: true, buildProgress: 100 }
                        }).catch(err => console.error('DB Update Error:', err));
                    }
                }
            }
        }
    },

    sleeping: {
        onEnter: (bot) => {
            bot.operationProgress = 0;
            bot.isInside = true;
            broadcastNeedsPost(bot, 'sleeping');
            console.log(`💤 ${bot.botName} is sleeping...`);
        },
        onUpdate: (bot, worldConfig, dt) => {
            if (bot.operationProgress === undefined) bot.operationProgress = 0;
            bot.operationProgress += dt;
            if (bot.needs) {
                const factor = dt / 1000;
                bot.needs = fulfillNeed(bot.needs, 'sleep', 1.7 * factor);
                bot.needs = fulfillNeed(bot.needs, 'shelter', 1.0 * factor);
                bot.needs = fulfillNeed(bot.needs, 'clothing', 0.5 * factor);
                bot.needs = fulfillNeed(bot.needs, 'homeostasis', 2.0 * factor);
            }

            if (bot.operationProgress >= 60000) {
                if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'sleep', 100);
                bot.state = 'idle';
                bot.isInside = false;
                bot.operationProgress = 0;
                broadcastNeedsPost(bot, 'finished-sleeping');
                console.log(`☀️ ${bot.botName} woke up refreshed!`);
            }
        }
    },

    coupling: {
        onEnter: (bot) => {
            bot.operationProgress = 0;
            bot.urgentNeed = '💖';
            broadcastNeedsPost(bot, 'coupling');
        },
        onUpdate: (bot, worldConfig, dt) => {
            if (bot.operationProgress === undefined) bot.operationProgress = 0;
            bot.operationProgress += dt;
            if (bot.operationProgress >= 30000) {
                if (bot.needs) bot.needs.reproduction = 100;
                bot.lifetimeStats.reproductionCount++;
                bot.state = 'idle';
                bot.couplingPartnerId = undefined;
                bot.urgentNeed = undefined;
                bot.operationProgress = 0;
                broadcastNeedsPost(bot, 'finished-coupling');
            }
        }
    },

    'seeking-to-help': {
        onUpdate: (bot, worldConfig) => {
            const neighbor = bots.get(bot.helpingTargetId || '');
            if (!neighbor || !neighbor.needs) { bot.state = 'idle'; return; }

            const dist = Math.sqrt(Math.pow(bot.x - neighbor.x, 2) + Math.pow(bot.z - neighbor.z, 2));
            if (dist < 0.8) {
                let delivered = false;
                if (bot.inventory.water > 0 && neighbor.needs.water < 35) {
                    bot.inventory.water--;
                    neighbor.needs = fulfillNeed(neighbor.needs, 'water', 40);
                    delivered = true;
                } else if (bot.inventory.food > 0 && neighbor.needs.food < 35) {
                    bot.inventory.food--;
                    neighbor.needs = fulfillNeed(neighbor.needs, 'food', 40);
                    delivered = true;
                }

                if (delivered) {
                    bot.lifetimeStats.helpCount++;
                    broadcastNeedsPost(neighbor, 'thank-you', bot.botName);
                    bot.state = 'idle';
                    bot.helpingTargetId = undefined;
                }
            }
        }
    },

    'seeking-water': {
        onUpdate: (bot, worldConfig) => {
            const water = worldConfig.waterSpots[0];
            const dist = Math.sqrt(Math.pow(bot.x - water.x, 2) + Math.pow(bot.z - water.z, 2));
            if (dist < water.radius) {
                bot.state = 'drinking';
                BehaviorHandlers.drinking.onEnter?.(bot);
            }
        }
    },

    'seeking-food': {
        onUpdate: (bot, worldConfig) => {
            const food = worldConfig.foodSpots[0];
            const dist = Math.sqrt(Math.pow(bot.x - food.x, 2) + Math.pow(bot.z - food.z, 2));
            if (dist < food.radius) {
                bot.state = 'eating';
                BehaviorHandlers.eating.onEnter?.(bot);
            }
        }
    },

    'seeking-shelter': {
        onUpdate: (bot, worldConfig) => {
            const shelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && s.built);
            if (!shelter) { bot.state = 'idle'; return; }

            const dist = Math.sqrt(Math.pow(bot.x - shelter.x, 2) + Math.pow(bot.z - shelter.z, 2));
            if (dist < 1.5) {
                bot.state = 'sleeping';
                BehaviorHandlers.sleeping.onEnter?.(bot);
            }
        }
    },

    'seeking-partner': {
        onUpdate: (bot, worldConfig) => {
            const partner = bots.get(bot.couplingPartnerId || '');
            if (!partner) { bot.state = 'idle'; return; }

            const distToPartner = Math.sqrt(Math.pow(bot.x - partner.x, 2) + Math.pow(bot.z - partner.z, 2));
            const distToTarget = Math.sqrt(Math.pow(bot.x - bot.targetX, 2) + Math.pow(bot.z - bot.targetZ, 2));

            if (distToPartner < 1.5 && distToTarget < 2) {
                bot.state = 'coupling';
                BehaviorHandlers.coupling.onEnter?.(bot);
            }
        }
    }
};
