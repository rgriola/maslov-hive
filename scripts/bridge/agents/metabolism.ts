/**
 * Metabolism Engine — handles bot physical needs decay and restoration.
 * 
 * @module bridge/agents/metabolism
 */

import { BotState } from '../../../src/types/simulation';
import {
    decayNeeds,
    fulfillNeed,
    getMostUrgentNeed,
    isInCriticalCondition,
} from '../../bot-needs';
import { getTemperatureModifier, getAQIModifier } from '../weather';
import { broadcastNeedsPost } from '../needs-posts';
import { bridgeState } from '../state';

/**
 * Constants for metabolism rates
 */
const BASE_HOMEOSTASIS_DECAY = 2;
const LABOR_MULTIPLIER = 2.5;
const SLEEPING_HOMEOSTASIS_RECOVERY = 8.0;
const PASSIVE_BREATHING_RECOVERY = 40.0;
const CLOTHING_DECAY_RATE = 0.5;
const HOMEOSTASIS_CRITICAL_DECAY = 2.0;

/**
 * Ticks the metabolism for a single bot.
 * 
 * @param bot The bot state to update
 * @param dt Delta time in milliseconds
 */
export function tickMetabolism(bot: BotState, dt: number) {
    if (!bot.needs || !bot.lastNeedUpdate) return;

    const now = new Date();
    const elapsedMinutes = dt / (1000 * 60);

    // Only update if a meaningful amount of time has passed
    if (elapsedMinutes <= 0.001) return;

    const tempMod = getTemperatureModifier();
    const aqiMod = getAQIModifier();

    const isLaboring = ['gathering-wood', 'gathering-stone', 'building-shelter'].includes(bot.state);
    const laborMultiplier = isLaboring ? LABOR_MULTIPLIER : 1.0;
    const isSleeping = bot.state === 'sleeping';

    // 1. Core Decay
    bot.needs = decayNeeds(bot.needs, elapsedMinutes, {
        homeostasis: BASE_HOMEOSTASIS_DECAY * tempMod * aqiMod,
        water: isSleeping ? 0 : 100 * laborMultiplier,
        food: isSleeping ? 0 : 50 * laborMultiplier,
    });

    // 2. Passive Recovery: "Stable" & "Thriving"
    if (bot.needs.water > 40 && bot.needs.food > 40 && bot.needs.sleep > 40 &&
        bot.needs.clothing > 20 && bot.needs.shelter > 20) {
        bot.needs = fulfillNeed(bot.needs, 'homeostasis', 1 * elapsedMinutes);
    }

    if (bot.needs.water > 60 && bot.needs.food > 60 && bot.needs.sleep > 60) {
        bot.needs = fulfillNeed(bot.needs, 'homeostasis', 5 * elapsedMinutes);
    }

    // 3. Air: passive breathing (auto-restore)
    bot.needs = fulfillNeed(bot.needs, 'air', PASSIVE_BREATHING_RECOVERY * elapsedMinutes);

    // 4. Homeostasis modulation
    if (isInCriticalCondition(bot.needs)) {
        // Accelerate decay when other needs are critical
        bot.needs.homeostasis = Math.max(0, bot.needs.homeostasis - HOMEOSTASIS_CRITICAL_DECAY * elapsedMinutes);
    }

    if (isSleeping && !isInCriticalCondition(bot.needs)) {
        // Faster recovery during sleep if not in distress
        bot.needs = fulfillNeed(bot.needs, 'homeostasis', SLEEPING_HOMEOSTASIS_RECOVERY * elapsedMinutes);
    }

    // 5. Clothing: decays faster in harsh weather
    if (bridgeState.currentTemperature < 10 || bridgeState.currentTemperature > 30) {
        bot.needs.clothing = Math.max(0, bot.needs.clothing - CLOTHING_DECAY_RATE * elapsedMinutes);
    }

    // 6. Critical Distress Alerts
    if (bot.needs.water < 20) broadcastNeedsPost(bot, 'critical-water');
    if (bot.needs.food < 20) broadcastNeedsPost(bot, 'critical-food');
    if (bot.needs.sleep < 20) broadcastNeedsPost(bot, 'critical-sleep');

    bot.lastNeedUpdate = now;
}
