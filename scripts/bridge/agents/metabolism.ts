/**
 * Metabolism Engine — handles bot physical needs decay and restoration.
 * 
 * @module bridge/agents/metabolism
 */

import { BotState } from '../../../src/types/simulation';
import {
    decayNeeds,
    fulfillNeed,
} from '../../bot-needs';
import { broadcastNeedsPost } from '../needs-posts';
import { bridgeState } from '../state';

/**
 * Constants for metabolism rates
 */
const LABOR_MULTIPLIER = 2.5;
const PASSIVE_BREATHING_RECOVERY = 40.0;
const CLOTHING_HARSH_WEATHER_DECAY = 0.5;  // extra clothing decay in extreme temps

/**
 * Ticks the metabolism for a single bot.
 * 
 * Homeostasis (health) is DERIVED — it reflects how well the bot's core
 * needs (water, food, sleep) are met. It does NOT have independent decay.
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

    const isLaboring = ['gathering-wood', 'gathering-stone', 'building-shelter'].includes(bot.state);
    const laborMultiplier = isLaboring ? LABOR_MULTIPLIER : 1.0;
    const isSleeping = bot.state === 'sleeping';

    // 1. Core Decay — water, food, sleep decay; shelter & clothing only decay when exposed
    bot.needs = decayNeeds(bot.needs, elapsedMinutes, {
        homeostasis: 0,  // NO independent decay — derived below
        water: isSleeping ? 0 : 100 * laborMultiplier,
        food: isSleeping ? 0 : 50 * laborMultiplier,
        shelter: 0,   // shelter only decays if bot has no shelter (handled below)
        clothing: 0,  // clothing only decays in harsh weather (handled below)
    });

    // 2. Air: passive breathing (auto-restore)
    bot.needs = fulfillNeed(bot.needs, 'air', PASSIVE_BREATHING_RECOVERY * elapsedMinutes);

    // 3. Shelter: decays only if bot has no built shelter
    const hasShelter = bot.isInside;
    if (!hasShelter) {
        // Slow decay when outdoors (0.5/min — takes 3+ hours to deplete from 100)
        bot.needs.shelter = Math.max(0, bot.needs.shelter - 0.5 * elapsedMinutes);
    }

    // 4. Clothing: only decays in harsh weather
    if (bridgeState.currentTemperature < 10 || bridgeState.currentTemperature > 30) {
        bot.needs.clothing = Math.max(0, bot.needs.clothing - CLOTHING_HARSH_WEATHER_DECAY * elapsedMinutes);
    }

    // 5. Homeostasis = DERIVED HEALTH — weighted average of core needs
    //    Reflects how well the bot is doing overall. No separate decay.
    const coreNeeds = [
        { value: bot.needs.water, weight: 3 },   // most critical
        { value: bot.needs.food,  weight: 3 },   // most critical
        { value: bot.needs.sleep, weight: 2 },   // important
        { value: bot.needs.air,   weight: 1 },   // usually fine
        { value: bot.needs.shelter,  weight: 0.5 },
        { value: bot.needs.clothing, weight: 0.5 },
    ];
    const totalWeight = coreNeeds.reduce((sum, n) => sum + n.weight, 0);
    const weightedAvg = coreNeeds.reduce((sum, n) => sum + n.value * n.weight, 0) / totalWeight;

    // Smooth transition — move homeostasis toward the target at ~5 points/min
    const target = weightedAvg;
    const diff = target - bot.needs.homeostasis;
    const maxChange = 5 * elapsedMinutes; // 5 pts/min convergence speed
    if (Math.abs(diff) < maxChange) {
        bot.needs.homeostasis = target;
    } else {
        bot.needs.homeostasis += Math.sign(diff) * maxChange;
    }
    bot.needs.homeostasis = Math.max(0, Math.min(100, bot.needs.homeostasis));

    // 6. Critical Distress Alerts
    if (bot.needs.water < 20) broadcastNeedsPost(bot, 'critical-water');
    if (bot.needs.food < 20) broadcastNeedsPost(bot, 'critical-food');
    if (bot.needs.sleep < 20) broadcastNeedsPost(bot, 'critical-sleep');

    bot.lastNeedUpdate = now;
}
