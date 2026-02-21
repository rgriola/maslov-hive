/**
 * Brain Engine — handles bot decision making and behavior state transitions.
 * 
 * @module bridge/agents/brain
 */

import { BotState, WorldConfig, ShelterData } from '../../../src/types/simulation';
import {
    getMostUrgentNeed,
    isInCriticalCondition,
    NEED_THRESHOLDS,
    fulfillNeed
} from '../../bot-needs';
import {
    bots,
    worldConfig,
    sharingCooldowns,
    WOOD_REQUIRED,
    STONE_REQUIRED
} from '../state';
import { broadcastNeedsPost } from '../needs-posts';
import { BehaviorHandlers } from './behavior-handlers';
import { findValidBuildSpot } from '../physics/navigation';

/**
 * Transitions a bot from one state to another, firing lifecycle hooks.
 */
export function transitionState(bot: BotState, newState: string) {
    if (bot.state === newState) return;

    const oldHandler = BehaviorHandlers[bot.state];
    const newHandler = BehaviorHandlers[newState];

    if (oldHandler?.onExit) oldHandler.onExit(bot);

    console.log(`🤖 ${bot.botName}: ${bot.state} -> ${newState}`);
    bot.state = newState as any;
    bot.operationProgress = 0; // Reset progress for the new state

    if (newHandler?.onEnter) newHandler.onEnter(bot);
}

/**
 * Main cognitive tick for a single bot.
 */
export function tickBrain(bot: BotState, dt: number) {
    const urgentNeed = getMostUrgentNeed(bot.needs!);

    // 1. Run the current behavior's update logic
    const handler = (BehaviorHandlers as any)[bot.state];
    if (handler) {
        handler.onUpdate(bot, worldConfig, dt);
        // If we're in a busy state, we usually don't interrupt unless it's a critical emergency
        if (bot.state !== 'idle' && bot.state !== 'wandering' && bot.state !== 'approaching') {
            return;
        }
    }

    // 2. Decision Making: Priority-based Evaluation

    // A. Hero System: Help others first if we are healthy
    if (evaluateHeroNeeds(bot)) return;

    // B. Survival: Water
    if (evaluateWaterNeeds(bot, urgentNeed)) return;

    // C. Survival: Food
    if (evaluateFoodNeeds(bot, urgentNeed)) return;

    // D. Survival: Sleep & Shelter
    if (evaluateShelterNeeds(bot, urgentNeed)) return;

    // E. Social: Reproduction
    if (evaluateSocialNeeds(bot)) return;

    // F. Environmental: Clothing/Cold
    if (evaluateClothingNeeds(bot)) return;
}

/**
 * Logic for seeks and rescues.
 */
function evaluateHeroNeeds(bot: BotState): boolean {
    if (isInCriticalCondition(bot.needs!) ||
        (bot.inventory.water === 0 && bot.inventory.food === 0) ||
        bot.state === 'seeking-to-help') return false;

    for (const neighbor of bots.values()) {
        if (neighbor.botId === bot.botId) continue;
        if (['seeking-to-help', 'sleeping', 'coupling'].includes(neighbor.state)) continue;

        if (neighbor.needs && (neighbor.needs.water < 35 || neighbor.needs.food < 35)) {
            const cooldownKey = `${bot.botId}-${neighbor.botId}-hero`;
            const lastHeroAction = sharingCooldowns.get(cooldownKey) || 0;
            const now = Date.now();

            if (now - lastHeroAction > 30000) {
                if (Math.random() < 0.5) {
                    bot.helpingTargetId = neighbor.botId;
                    bot.targetX = neighbor.x;
                    bot.targetZ = neighbor.z;
                    bot.path = [];

                    const replyToId = (neighbor.needs.water < neighbor.needs.food)
                        ? neighbor.lastCriticalPostIds?.water
                        : neighbor.lastCriticalPostIds?.food;

                    transitionState(bot, 'seeking-to-help');
                    broadcastNeedsPost(bot, 'coming-to-help', neighbor.botName, replyToId);
                    sharingCooldowns.set(cooldownKey, now + 60000);
                    return true;
                }
                sharingCooldowns.set(cooldownKey, now);
            }
        }
    }
    return false;
}

function evaluateWaterNeeds(bot: BotState, urgentNeed: any): boolean {
    if (urgentNeed.need !== 'water' || bot.state === 'seeking-water') return false;

    if (bot.needs!.water < 60 && bot.inventory.water > 0) {
        bot.inventory.water--;
        bot.lifetimeStats.totalWater++;
        bot.needs = fulfillNeed(bot.needs!, 'water', 40);
        broadcastNeedsPost(bot, 'inventory-water');
        return true;
    }

    if (bot.needs!.water < 30) {
        const water = worldConfig.waterSpots[0];
        // Add random jitter within the water spot radius
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * (water.radius * 0.7);
        bot.targetX = water.x + Math.cos(angle) * dist;
        bot.targetZ = water.z + Math.sin(angle) * dist;
        bot.path = [];
        transitionState(bot, 'seeking-water');
        broadcastNeedsPost(bot, 'seeking-water');
        return true;
    }
    return false;
}

function evaluateFoodNeeds(bot: BotState, urgentNeed: any): boolean {
    if (urgentNeed.need !== 'food' || bot.state === 'seeking-food') return false;

    if (bot.needs!.food < 60 && bot.inventory.food > 0) {
        bot.inventory.food--;
        bot.lifetimeStats.totalFood++;
        bot.needs = fulfillNeed(bot.needs!, 'food', 40);
        broadcastNeedsPost(bot, 'inventory-food');
        return true;
    }

    if (bot.needs!.food < 25) {
        const food = worldConfig.foodSpots[0];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * (food.radius * 0.7);
        bot.targetX = food.x + Math.cos(angle) * dist;
        bot.targetZ = food.z + Math.sin(angle) * dist;
        bot.path = [];
        transitionState(bot, 'seeking-food');
        broadcastNeedsPost(bot, 'seeking-food');
        return true;
    }
    return false;
}

function evaluateShelterNeeds(bot: BotState, urgentNeed: any): boolean {
    if (urgentNeed.need !== 'sleep') return false;
    if (['seeking-shelter', 'gathering-wood', 'gathering-stone', 'building-shelter'].includes(bot.state)) return false;

    const ownShelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && s.built);
    if (ownShelter) {
        bot.targetX = ownShelter.x;
        bot.targetZ = ownShelter.z;
        bot.path = [];
        transitionState(bot, 'seeking-shelter');
        broadcastNeedsPost(bot, 'seeking-shelter');
        return true;
    }

    // No shelter? Build one or gather resources
    const existingShelter = worldConfig.shelters.find(s => s.ownerId === bot.botId);
    if (existingShelter && !existingShelter.built) {
        bot.targetX = existingShelter.x;
        bot.targetZ = existingShelter.z;
        bot.path = [];
        transitionState(bot, 'building-shelter');
        return true;
    }

    if (!existingShelter && bot.inventory.wood >= WOOD_REQUIRED && bot.inventory.stone >= STONE_REQUIRED) {
        const spot = findValidBuildSpot(bot, worldConfig);
        if (spot) {
            bot.targetX = spot.x;
            bot.targetZ = spot.z;
            bot.path = [];
            transitionState(bot, 'building-shelter');
            broadcastNeedsPost(bot, 'building-shelter');
            return true;
        }
    }

    if (bot.inventory.wood < WOOD_REQUIRED) {
        const forest = worldConfig.woodSpots[0];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * (forest.radius * 0.7);
        bot.targetX = forest.x + Math.cos(angle) * dist;
        bot.targetZ = forest.z + Math.sin(angle) * dist;
        bot.path = [];
        transitionState(bot, 'gathering-wood');
        broadcastNeedsPost(bot, 'gathering-wood');
        return true;
    }

    if (bot.inventory.stone < STONE_REQUIRED) {
        const quarry = worldConfig.stoneSpots[0];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * (quarry.radius * 0.7);
        bot.targetX = quarry.x + Math.cos(angle) * dist;
        bot.targetZ = quarry.z + Math.sin(angle) * dist;
        bot.path = [];
        transitionState(bot, 'gathering-stone');
        broadcastNeedsPost(bot, 'gathering-stone');
        return true;
    }

    return false;
}

function evaluateSocialNeeds(bot: BotState): boolean {
    if (bot.needs!.reproduction >= 50 || bot.state === 'seeking-partner') return false;

    let partner: BotState | null = null;
    let minDist = Infinity;

    for (const candidate of bots.values()) {
        if (candidate.botId === bot.botId) continue;
        if (candidate.needs!.reproduction < 50) {
            const dist = Math.sqrt(Math.pow(bot.x - candidate.x, 2) + Math.pow(bot.z - candidate.z, 2));
            if (dist < minDist) {
                minDist = dist;
                partner = candidate;
            }
        }
    }

    if (partner) {
        const corner = { x: 10, z: 10 }; // Simplified logic for demo
        bot.targetX = corner.x; bot.targetZ = corner.z;
        partner.targetX = corner.x; partner.targetZ = corner.z;
        bot.couplingPartnerId = partner.botId;
        partner.couplingPartnerId = bot.botId;

        transitionState(bot, 'seeking-partner');
        transitionState(partner, 'seeking-partner');
        broadcastNeedsPost(bot, 'seeking-partner');
        return true;
    }
    return false;
}

function evaluateClothingNeeds(bot: BotState): boolean {
    if (bot.needs!.clothing >= NEED_THRESHOLDS.clothing || bot.state === 'seeking-shelter') return false;

    const ownShelter = worldConfig.shelters.find(s => s.ownerId === bot.botId && s.built);
    if (ownShelter) {
        bot.targetX = ownShelter.x;
        bot.targetZ = ownShelter.z + 0.6;
        bot.path = [];

        const now = Date.now();
        const lastCold = (bot as any).lastColdCheckTime || 0;
        if (now - lastCold > 15000) {
            broadcastNeedsPost(bot, 'cold');
            (bot as any).lastColdCheckTime = now;
        }

        transitionState(bot, 'seeking-shelter');
        return true;
    }
    return false;
}
