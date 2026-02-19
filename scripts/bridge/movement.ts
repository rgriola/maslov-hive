/**
 * Autonomous Movement Simulation — needs decay, pathfinding, collision, behaviors.
 *
 * This is the core simulation loop, called every TICK_INTERVAL ms.
 *
 * @module bridge/movement
 */

import { BotState, ShelterData } from '../../src/types/simulation';
import { findPath } from '../../src/lib/pathfinding';
import {
  decayNeeds,
  fulfillNeed,
  getMostUrgentNeed,
  isInCriticalCondition,
  NEED_THRESHOLDS,
} from '../bot-needs';

import {
  bots,
  worldConfig,
  prisma,
  pardonCooldowns,
  greetingTimestamps,
  sharingCooldowns,
  bridgeState,
  MOVE_SPEED,
  WANDER_RADIUS,
  IDLE_CHANCE,
  APPROACH_DISTANCE,
  WOOD_REQUIRED,
  STONE_REQUIRED,
  AVOIDANCE_RADIUS,
  SIDESTEP_STRENGTH,
} from './state';
import { broadcastBotPositions } from './broadcast';
import { broadcastNeedsPost } from './needs-posts';
import { getTemperatureModifier, getAQIModifier } from './weather';

// ─── Main Simulation Tick ────────────────────────────────────────

export function simulateMovement() {
  // ─── Update Physical Needs ─────────────────────────────────
  const now = new Date();
  for (const bot of bots.values()) {
    if (!bot.needs || !bot.lastNeedUpdate) continue;

    const elapsedMs = now.getTime() - bot.lastNeedUpdate.getTime();
    const elapsedMinutes = elapsedMs / (1000 * 60);

    // Decay needs
    if (elapsedMinutes > 0.01) {
      const tempMod = getTemperatureModifier();
      const aqiMod = getAQIModifier();

      const isLaboring = ['gathering-wood', 'gathering-stone', 'building-shelter'].includes(bot.state);
      const laborMultiplier = isLaboring ? 2.5 : 1.0;

      const isSleeping = bot.state === 'sleeping';

      bot.needs = decayNeeds(bot.needs, elapsedMinutes, {
        homeostasis: 2 * tempMod * aqiMod,
        water: isSleeping ? 0 : 100 * laborMultiplier,
        food: isSleeping ? 0 : 50 * laborMultiplier,
      });

      // ─── Passive Recovery: "Stable" & "Thriving" ────────────
      if (bot.needs.water > 40 && bot.needs.food > 40 && bot.needs.sleep > 40 &&
        bot.needs.clothing > 20 && bot.needs.shelter > 20) {
        bot.needs = fulfillNeed(bot.needs, 'homeostasis', 1 * elapsedMinutes);
      }

      if (bot.needs.water > 60 && bot.needs.food > 60 && bot.needs.sleep > 60) {
        bot.needs = fulfillNeed(bot.needs, 'homeostasis', 5 * elapsedMinutes);
      }
      bot.lastNeedUpdate = now;

      // Air: passive breathing (auto-restore)
      bot.needs = fulfillNeed(bot.needs, 'air', 40 * elapsedMinutes);

      // Homeostasis: accelerate decay when other needs critical
      if (isInCriticalCondition(bot.needs)) {
        bot.needs.homeostasis = Math.max(0, bot.needs.homeostasis - 2 * elapsedMinutes);
      }
      if (bot.state === 'sleeping' && !isInCriticalCondition(bot.needs)) {
        bot.needs = fulfillNeed(bot.needs, 'homeostasis', 8 * elapsedMinutes);
      }

      // Clothing: decays faster in harsh weather
      if (bridgeState.currentTemperature < 10 || bridgeState.currentTemperature > 30) {
        bot.needs.clothing = Math.max(0, bot.needs.clothing - 0.5 * elapsedMinutes);
      }

      const urgentNeed = getMostUrgentNeed(bot.needs);

      // ─── Critical Distress Alerts (20% Threshold) ───────────
      if (bot.needs.water < 20) broadcastNeedsPost(bot, 'critical-water');
      if (bot.needs.food < 20) broadcastNeedsPost(bot, 'critical-food');
      if (bot.needs.sleep < 20) broadcastNeedsPost(bot, 'critical-sleep');

      // ─── Status & Busy Check ────────────────────────────────
      const isSelfInDistress = isInCriticalCondition(bot.needs);
      const globalBusyStates = [
        'drinking', 'eating', 'building-shelter', 'sleeping',
        'seeking-to-help', 'seeking-partner', 'coupling',
      ];

      // ─── Hero System: Proactively seek out needy neighbors ──
      const canHelp = !isSelfInDistress &&
        (bot.inventory.water > 0 || bot.inventory.food > 0) &&
        ['idle', 'thinking', 'walking', 'wandering'].includes(bot.state);

      if (canHelp) {
        for (const neighbor of bots.values()) {
          if (neighbor.botId === bot.botId) continue;
          if (neighbor.state === 'seeking-to-help' || neighbor.state === 'sleeping' || neighbor.state === 'coupling') continue;

          if (neighbor.needs && (neighbor.needs.water < 35 || neighbor.needs.food < 35)) {
            const cooldownKey = `${bot.botId}-${neighbor.botId}-hero`;
            const lastHeroAction = sharingCooldowns.get(cooldownKey) || 0;
            const nowTime = Date.now();

            if (nowTime - lastHeroAction > 30000) {
              if (Math.random() < 0.5) {
                bot.state = 'seeking-to-help';
                bot.helpingTargetId = neighbor.botId;
                bot.targetX = neighbor.x;
                bot.targetZ = neighbor.z;
                bot.path = [];
                bot.pathIndex = 0;
                const replyToId = (neighbor.needs!.water < neighbor.needs!.food)
                  ? neighbor.lastCriticalPostIds?.water
                  : neighbor.lastCriticalPostIds?.food;

                broadcastNeedsPost(bot, 'coming-to-help', neighbor.botName, replyToId);
                console.log(`🦸 ${bot.botName} is going to help ${neighbor.botName}! (Replying to: ${replyToId})`);
                sharingCooldowns.set(cooldownKey, nowTime + 60000);
                break;
              } else {
                sharingCooldowns.set(cooldownKey, nowTime);
              }
            }
          }
        }
      }

      // ─── Water Seeking ──────────────────────────────────────
      if (urgentNeed.need === 'water' && !globalBusyStates.includes(bot.state) && bot.state !== 'seeking-water') {
        if (bot.needs.water < 60 && bot.inventory.water > 0) {
          bot.inventory.water--;
          bot.lifetimeStats.totalWater++;
          bot.needs = fulfillNeed(bot.needs, 'water', 40);
          broadcastNeedsPost(bot, 'inventory-water');
          console.log(`🍶 ${bot.botName} drank from canteen! (Water: ${bot.needs.water.toFixed(1)}, Inv: ${bot.inventory.water})`);
        } else if (bot.needs.water < 30) {
          const nearestWater = worldConfig.waterSpots[0];
          if (nearestWater) {
            bot.targetX = nearestWater.x;
            bot.targetZ = nearestWater.z;
            bot.path = [];
            bot.pathIndex = 0;
            bot.state = 'seeking-water';
            broadcastNeedsPost(bot, 'seeking-water');
            console.log(`💧 ${bot.botName} is thirsty (water: ${bot.needs.water.toFixed(1)}) - seeking water at (${nearestWater.x.toFixed(1)}, ${nearestWater.z.toFixed(1)})`);
          }
        }
      }

      // Check if bot reached water
      if (bot.state === 'seeking-water' && worldConfig.waterSpots.length > 0) {
        const water = worldConfig.waterSpots[0];
        const distToWater = Math.sqrt(
          Math.pow(bot.x - water.x, 2) + Math.pow(bot.z - water.z, 2)
        );

        if (distToWater < water.radius) {
          bot.state = 'drinking';
          broadcastNeedsPost(bot, 'drinking');
          console.log(`🍶 ${bot.botName} is drinking! Hydrating over 20s...`);

          let drinkTicks = 0;
          const maxTicks = 60;
          const drinkInterval = setInterval(() => {
            drinkTicks++;
            if (bot.needs) {
              if (bot.needs.water < 100) {
                bot.needs = fulfillNeed(bot.needs, 'water', 5);
              } else if (bot.inventory.water < 5) {
                if (drinkTicks % 2 === 0) {
                  if (bot.inventory.water < 5) {
                    bot.inventory.water++;
                    bot.lifetimeStats.waterRefillCount++;
                    console.log(`🍶 ${bot.botName} collected water +1 (Inv: ${bot.inventory.water})`);
                  }
                }
              }

              const isNeedsFull = (bot.needs?.water || 0) >= 100;
              const isInvFull = bot.inventory.water >= 5;

              if ((isNeedsFull && isInvFull) || drinkTicks >= maxTicks) {
                clearInterval(drinkInterval);
                if (bot.state === 'drinking') {
                  if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'water', 100);
                  bot.state = 'idle';
                  broadcastNeedsPost(bot, 'finished-drinking');
                  console.log(`✅ ${bot.botName} finished drinking (Water: ${bot.needs?.water.toFixed(1)}, Inv: ${bot.inventory.water})`);
                }
              }
            }
          }, 1000);
        }
      }

      // ─── Food Seeking ───────────────────────────────────────
      if (urgentNeed.need === 'food' && !globalBusyStates.includes(bot.state) && bot.state !== 'seeking-food') {
        if (bot.needs.food < 60 && bot.inventory.food > 0) {
          bot.inventory.food--;
          bot.lifetimeStats.totalFood++;
          bot.needs = fulfillNeed(bot.needs, 'food', 40);
          broadcastNeedsPost(bot, 'inventory-food');
          console.log(`🍎 ${bot.botName} ate a snack! (Food: ${bot.needs.food.toFixed(1)}, Inv: ${bot.inventory.food})`);
        } else if (bot.needs.food < 25) {
          const nearestFood = worldConfig.foodSpots[0];
          if (nearestFood) {
            bot.targetX = nearestFood.x;
            bot.targetZ = nearestFood.z;
            bot.path = [];
            bot.pathIndex = 0;
            bot.state = 'seeking-food';
            broadcastNeedsPost(bot, 'seeking-food');
            console.log(`🍎 ${bot.botName} is hungry (food: ${bot.needs.food.toFixed(1)}) - seeking food at (${nearestFood.x.toFixed(1)}, ${nearestFood.z.toFixed(1)})`);
          }
        }
      }

      // Check if bot reached food
      if (bot.state === 'seeking-food' && worldConfig.foodSpots.length > 0) {
        const food = worldConfig.foodSpots[0];
        const distToFood = Math.sqrt(
          Math.pow(bot.x - food.x, 2) + Math.pow(bot.z - food.z, 2)
        );

        if (distToFood < food.radius) {
          bot.state = 'eating';
          broadcastNeedsPost(bot, 'eating');
          console.log(`🍴 ${bot.botName} is eating! Filling up over 20s...`);

          let eatTicks = 0;
          const maxTicks = 60;
          const eatInterval = setInterval(() => {
            eatTicks++;
            if (bot.needs) {
              if (bot.needs.food < 100) {
                bot.needs = fulfillNeed(bot.needs, 'food', 5);
              } else if (bot.inventory.food < 3) {
                if (eatTicks % 2 === 0) {
                  if (bot.inventory.food < 3) {
                    bot.inventory.food++;
                    bot.lifetimeStats.foodRefillCount++;
                    console.log(`🍎 ${bot.botName} collected food +1 (Inv: ${bot.inventory.food})`);
                  }
                }
              }

              const isNeedsFull = (bot.needs?.food || 0) >= 100;
              const isInvFull = bot.inventory.food >= 3;

              if ((isNeedsFull && isInvFull) || eatTicks >= maxTicks) {
                clearInterval(eatInterval);
                if (bot.state === 'eating') {
                  if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'food', 100);
                  bot.state = 'idle';
                  broadcastNeedsPost(bot, 'finished-eating');
                  console.log(`✅ ${bot.botName} finished eating (Food: ${bot.needs?.food.toFixed(1)}, Inv: ${bot.inventory.food})`);
                }
              }
            }
          }, 1000);
        }
      }

      // ─── Sleep & Shelter System ─────────────────────────────
      if (urgentNeed.need === 'sleep' && !globalBusyStates.includes(bot.state) && !['seeking-shelter', 'gathering-wood', 'gathering-stone'].includes(bot.state)) {
        const ownShelter = worldConfig.shelters.find((s: ShelterData) => s.ownerId === bot.botId && s.built);

        if (ownShelter) {
          bot.targetX = ownShelter.x;
          bot.targetZ = ownShelter.z;
          bot.path = [];
          bot.pathIndex = 0;
          bot.state = 'seeking-shelter';
          broadcastNeedsPost(bot, 'seeking-shelter');
          console.log(`😴 ${bot.botName} is tired (sleep: ${bot.needs.sleep.toFixed(1)}) - heading to shelter`);
        } else {
          const existingShelter = worldConfig.shelters.find((s: ShelterData) => s.ownerId === bot.botId);

          if (existingShelter && !existingShelter.built) {
            bot.targetX = existingShelter.x;
            bot.targetZ = existingShelter.z;
            bot.path = [];
            bot.pathIndex = 0;
            bot.state = 'building-shelter';
            console.log(`🔨 ${bot.botName} resuming shelter construction`);
          } else if (!existingShelter && bot.inventory.wood >= WOOD_REQUIRED && bot.inventory.stone >= STONE_REQUIRED) {
            const buildSpot = findValidBuildSpot(bot);

            if (buildSpot) {
              const tempId = `shelter-${bot.botId}-${Date.now()}`;
              const newShelter = {
                id: tempId,
                type: 'hut',
                x: buildSpot.x,
                z: buildSpot.z,
                ownerId: bot.botId,
                ownerName: bot.botName,
                ownerColor: bot.color,
                built: false,
                buildProgress: 0,
              };
              worldConfig.shelters.push(newShelter);
              bot.shelterId = newShelter.id;

              prisma.shelter
                .create({
                  data: {
                    type: 'hut',
                    x: buildSpot.x,
                    z: buildSpot.z,
                    ownerId: bot.botId,
                    built: false,
                    buildProgress: 0,
                  },
                })
                .then((dbShelter) => {
                  newShelter.id = dbShelter.id;
                  bot.shelterId = dbShelter.id;
                  console.log(`💾 Shelter saved to DB: ${dbShelter.id}`);
                })
                .catch((err) => {
                  console.error('Failed to save shelter to DB:', err);
                });

              bot.targetX = buildSpot.x;
              bot.targetZ = buildSpot.z;
              bot.path = [];
              bot.pathIndex = 0;
              bot.state = 'building-shelter';
              broadcastNeedsPost(bot, 'building-shelter');
              console.log(`🔨 ${bot.botName} is going to build a shelter at (${buildSpot.x.toFixed(1)}, ${buildSpot.z.toFixed(1)})`);
            } else {
              console.log(`⚠️ ${bot.botName} couldn't find a valid spot to build shelter`);
            }
          } else if (bot.inventory.wood < WOOD_REQUIRED) {
            const nearestWood = worldConfig.woodSpots[0];
            if (nearestWood) {
              bot.targetX = nearestWood.x;
              bot.targetZ = nearestWood.z;
              bot.path = [];
              bot.pathIndex = 0;
              bot.state = 'gathering-wood';
              broadcastNeedsPost(bot, 'gathering-wood');
              console.log(`🪓 ${bot.botName} needs wood (${bot.inventory.wood}/${WOOD_REQUIRED}) - heading to forest`);
            }
          } else if (bot.inventory.stone < STONE_REQUIRED) {
            const nearestStone = worldConfig.stoneSpots[0];
            if (nearestStone) {
              bot.targetX = nearestStone.x;
              bot.targetZ = nearestStone.z;
              bot.path = [];
              bot.pathIndex = 0;
              bot.state = 'gathering-stone';
              broadcastNeedsPost(bot, 'gathering-stone');
              console.log(`⛏️ ${bot.botName} needs stone (${bot.inventory.stone}/${STONE_REQUIRED}) - heading to quarry`);
            }
          }
        }
      }

      // Check if bot reached wood spot
      if (bot.state === 'gathering-wood' && worldConfig.woodSpots.length > 0) {
        const wood = worldConfig.woodSpots[0];
        const distToWood = Math.sqrt(
          Math.pow(bot.x - wood.x, 2) + Math.pow(bot.z - wood.z, 2)
        );

        if (distToWood < wood.radius && wood.available > 0) {
          bot.inventory.wood += 1;
          bot.lifetimeStats.totalWood += 1;
          wood.available -= 1;
          console.log(`🪵 ${bot.botName} gathered wood (${bot.inventory.wood}/${WOOD_REQUIRED})`);

          if (bot.inventory.wood >= WOOD_REQUIRED) {
            bot.state = 'idle';
            console.log(`✅ ${bot.botName} has enough wood!`);
          } else {
            setTimeout(() => {
              if (bot.state === 'gathering-wood') {
                bot.state = 'idle';
              }
            }, 1000);
          }
        }
      }

      // Check if bot reached stone spot
      if (bot.state === 'gathering-stone' && worldConfig.stoneSpots.length > 0) {
        const stone = worldConfig.stoneSpots[0];
        const distToStone = Math.sqrt(
          Math.pow(bot.x - stone.x, 2) + Math.pow(bot.z - stone.z, 2)
        );

        if (distToStone < stone.radius && stone.available > 0) {
          bot.inventory.stone += 1;
          bot.lifetimeStats.totalStone += 1;
          stone.available -= 1;
          console.log(`🪨 ${bot.botName} gathered stone (${bot.inventory.stone}/${STONE_REQUIRED})`);

          if (bot.inventory.stone >= STONE_REQUIRED) {
            bot.state = 'idle';
            console.log(`✅ ${bot.botName} has enough stone!`);
          } else {
            setTimeout(() => {
              if (bot.state === 'gathering-stone') {
                bot.state = 'idle';
              }
            }, 1000);
          }
        }
      }

      // Check if bot reached build site
      if (bot.state === 'building-shelter') {
        const shelter = worldConfig.shelters.find((s: ShelterData) => s.ownerId === bot.botId && !s.built);
        if (shelter) {
          const distToSite = Math.sqrt(
            Math.pow(bot.x - shelter.x, 2) + Math.pow(bot.z - shelter.z, 2)
          );

          if (distToSite < 1.5) {
            shelter.buildProgress += 1;
            console.log(`🔨 ${bot.botName} is building... (${shelter.buildProgress}%)`);

            prisma.shelter
              .update({ where: { id: shelter.id }, data: { buildProgress: shelter.buildProgress } })
              .catch((err) => console.error('Failed to update shelter progress:', err));

            if (shelter.buildProgress >= 100) {
              shelter.built = true;
              bot.inventory.wood -= WOOD_REQUIRED;
              bot.inventory.stone -= STONE_REQUIRED;
              bot.state = 'idle';
              broadcastNeedsPost(bot, 'finished-building');
              console.log(`🏠 ${bot.botName} finished building shelter!`);

              prisma.shelter
                .update({ where: { id: shelter.id }, data: { built: true, buildProgress: 100 } })
                .catch((err) => console.error('Failed to mark shelter as built:', err));
            } else {
              setTimeout(() => {
                if (bot.state === 'building-shelter') {
                  bot.state = 'idle';
                }
              }, 800);
            }
          }
        }
      }

      // Check if bot reached shelter to sleep
      if (bot.state === 'seeking-shelter') {
        const shelter = worldConfig.shelters.find((s: ShelterData) => s.ownerId === bot.botId && s.built);
        if (shelter) {
          const distToShelter = Math.sqrt(
            Math.pow(bot.x - shelter.x, 2) + Math.pow(bot.z - shelter.z, 2)
          );

          if (distToShelter < 1.5) {
            bot.state = 'sleeping';
            bot.isInside = true;
            shelter.isOccupied = true;
            bot.x = shelter.x;
            bot.z = shelter.z;

            broadcastNeedsPost(bot, 'sleeping');
            console.log(`💤 ${bot.botName} is sleeping inside shelter...`);

            // Auto-refill from inventory if needed
            if (bot.needs) {
              let usedWater = false;
              while (bot.needs.water < 90 && bot.inventory.water > 0) {
                bot.inventory.water--;
                bot.lifetimeStats.totalWater++;
                bot.needs = fulfillNeed(bot.needs, 'water', 40);
                usedWater = true;
                console.log(`🍶 ${bot.botName} used emergency water before sleep (Inv: ${bot.inventory.water})`);
              }
              if (usedWater) broadcastNeedsPost(bot, 'inventory-water');

              let usedFood = false;
              while (bot.needs.food < 90 && bot.inventory.food > 0) {
                bot.inventory.food--;
                bot.lifetimeStats.totalFood++;
                bot.needs = fulfillNeed(bot.needs, 'food', 40);
                usedFood = true;
                console.log(`🍎 ${bot.botName} used emergency snack before sleep (Inv: ${bot.inventory.food})`);
              }
              if (usedFood) broadcastNeedsPost(bot, 'inventory-food');
            }

            // Sleep for 1 minute, gradually restoring
            let sleepTicks = 0;
            const sleepInterval = setInterval(() => {
              if (bot.state !== 'sleeping') {
                bot.isInside = false;
                shelter.isOccupied = false;
                clearInterval(sleepInterval);
                return;
              }

              sleepTicks++;
              if (bot.needs) {
                bot.needs = fulfillNeed(bot.needs, 'sleep', 1.7);
                bot.needs = fulfillNeed(bot.needs, 'shelter', 1);
                bot.needs = fulfillNeed(bot.needs, 'clothing', 0.5);
                bot.needs = fulfillNeed(bot.needs, 'homeostasis', 2.0);
              }

              if (sleepTicks >= 60) {
                clearInterval(sleepInterval);
                if (bot.state === 'sleeping') {
                  if (bot.needs) bot.needs = fulfillNeed(bot.needs, 'sleep', 100);
                  bot.state = 'idle';
                  bot.isInside = false;
                  shelter.isOccupied = false;
                  broadcastNeedsPost(bot, 'finished-sleeping');
                  console.log(`☀️ ${bot.botName} woke up refreshed! (sleep: ${bot.needs?.sleep.toFixed(1)})`);
                }
              }
            }, 1000);
          }
        }
      }

      // ─── Reproduction: coupling behavior ────────────────────
      const reproStates = [
        'seeking-partner', 'coupling', 'sleeping', 'seeking-water', 'drinking',
        'seeking-food', 'eating', 'seeking-shelter', 'gathering-wood',
        'gathering-stone', 'building-shelter', 'seeking-to-help',
      ];

      if (bot.needs && bot.needs.reproduction < 50 && !reproStates.includes(bot.state)) {
        let partner: typeof bot | null = null;
        let minDist = Infinity;
        let potentialPartnersCount = 0;

        for (const candidate of bots.values()) {
          if (candidate.botId === bot.botId) continue;
          potentialPartnersCount++;
          if (reproStates.includes(candidate.state)) continue;

          const dist = Math.sqrt(Math.pow(bot.x - candidate.x, 2) + Math.pow(bot.z - candidate.z, 2));
          if (dist < minDist) {
            minDist = dist;
            partner = candidate;
          }
        }

        if (partner) {
          const corners = [
            { x: 10, z: 10 },
            { x: 10, z: -10 },
            { x: -10, z: 10 },
            { x: -10, z: -10 },
          ];
          const selectedCorner = corners[Math.floor(Math.random() * corners.length)];

          bot.targetX = selectedCorner.x;
          bot.targetZ = selectedCorner.z;
          bot.path = [];
          bot.pathIndex = 0;
          bot.state = 'seeking-partner';
          bot.couplingPartnerId = partner.botId;

          partner.targetX = selectedCorner.x;
          partner.targetZ = selectedCorner.z;
          partner.path = [];
          partner.pathIndex = 0;
          partner.state = 'seeking-partner';
          partner.couplingPartnerId = bot.botId;

          broadcastNeedsPost(bot, 'seeking-partner');
          console.log(`💝 ${bot.botName} and ${partner.botName} matched! Heading to corner (${selectedCorner.x}, ${selectedCorner.z}) for a date.`);
        } else if (potentialPartnersCount > 0 && Math.random() < 0.05) {
          console.log(`⚠️ Social Deadlock: ${bot.botName} is seeking connection but no healthy partners (>50%) are available.`);
        }
      }

      // Check if seeking-partner bots have met at the corner
      if (bot.state === 'seeking-partner' && bot.couplingPartnerId) {
        const partner = bots.get(bot.couplingPartnerId);
        if (partner) {
          const distToPartner = Math.sqrt(Math.pow(bot.x - partner.x, 2) + Math.pow(bot.z - partner.z, 2));
          const distToTarget = Math.sqrt(Math.pow(bot.x - bot.targetX, 2) + Math.pow(bot.z - bot.targetZ, 2));

          if (distToPartner < 1.5 && distToTarget < 2) {
            bot.state = 'coupling';
            partner.state = 'coupling';
            bot.urgentNeed = '💖';
            partner.urgentNeed = '💖';

            broadcastNeedsPost(bot, 'coupling');
            console.log(`💕 ${bot.botName} and ${partner.botName} are coupling at the corner...`);

            setTimeout(() => {
              if (bot.couplingPartnerId) {
                const partner = bots.get(bot.couplingPartnerId);
                if (partner && partner.state === 'coupling' && partner.couplingPartnerId === bot.botId) {
                  if (bot.needs) bot.needs.reproduction = 100;
                  if (partner.needs) partner.needs.reproduction = 100;

                  bot.lifetimeStats.reproductionCount++;

                  bot.state = 'idle';
                  partner.state = 'idle';
                  bot.couplingPartnerId = undefined;
                  partner.couplingPartnerId = undefined;
                  bot.urgentNeed = undefined;
                  partner.urgentNeed = undefined;

                  broadcastNeedsPost(bot, 'finished-coupling');
                  console.log(`💖 Social connection complete between ${bot.botName} and ${partner.botName}!`);
                }
              }
            }, 30000);
          }
        } else {
          bot.state = 'idle';
          bot.couplingPartnerId = undefined;
        }
      }

      // ─── Hero System: Seek and Help Behavior ────────────────
      if (bot.state === 'seeking-to-help' && bot.helpingTargetId) {
        const neighbor = bots.get(bot.helpingTargetId);
        if (!neighbor || !neighbor.needs) {
          bot.state = 'idle';
          bot.helpingTargetId = undefined;
        } else {
          if (isSelfInDistress) {
            bot.state = 'idle';
            bot.helpingTargetId = undefined;
            console.log(`🚑 ${bot.botName} aborted rescue of ${neighbor.botName} due to own distress!`);
          } else {
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
                console.log(`🎁 ${bot.botName} successfully helped ${neighbor.botName}!`);
              } else if (neighbor.needs.water >= 30 && neighbor.needs.food >= 30) {
                bot.state = 'idle';
                bot.helpingTargetId = undefined;
              }
            }
          }
        }
      }

      // ─── Clothing: when critically low, seek shelter ────────
      if (bot.needs && bot.needs.clothing < NEED_THRESHOLDS.clothing && !reproStates.includes(bot.state)) {
        const ownShelter = worldConfig.shelters.find((s: ShelterData) => s.ownerId === bot.botId && s.built);
        if (ownShelter) {
          bot.targetX = ownShelter.x;
          bot.targetZ = ownShelter.z + 0.6;
          bot.path = [];
          bot.pathIndex = 0;
          bot.state = 'seeking-shelter';
          broadcastNeedsPost(bot, 'cold');
          console.log(`🥶 ${bot.botName} is cold (clothing: ${bot.needs.clothing.toFixed(0)}) — heading to shelter`);
        }
      }
    }
  }

  // ─── Bot Movement Logic (A* Pathfinding) ───────────────────
  for (const bot of bots.values()) {
    if (['sleeping', 'coupling', 'speaking'].includes(bot.state)) continue;
    const botRadius = bot.width / 2;

    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      const dx = bot.targetX - bot.x;
      const dz = bot.targetZ - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.5) {
        bot.path = findPath(bot.x, bot.z, bot.targetX, bot.targetZ, botRadius, worldConfig);
        bot.pathIndex = 0;
      } else {
        bot.x = bot.targetX;
        bot.z = bot.targetZ;
        if (bot.state !== 'speaking') {
          bot.state = 'idle';
        }
        if (Math.random() > IDLE_CHANCE) {
          pickNewTarget(bot);
        }
        continue;
      }
    }

    if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
      const waypoint = bot.path[bot.pathIndex];
      const dx = waypoint.x - bot.x;
      const dz = waypoint.z - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.2) {
        const step = Math.min(MOVE_SPEED, dist);
        bot.x = bot.x + (dx / dist) * step;
        bot.z = bot.z + (dz / dist) * step;
        bot.state = 'wandering';
      } else {
        bot.pathIndex++;

        if (bot.pathIndex >= bot.path.length) {
          bot.x = bot.targetX;
          bot.z = bot.targetZ;
          if (bot.state !== 'speaking') {
            bot.state = 'idle';
          }
          bot.path = [];
          bot.pathIndex = 0;

          if (Math.random() > IDLE_CHANCE) {
            pickNewTarget(bot);
          }
        }
      }
    }
  }

  // ─── Soft Proximity Avoidance (polite sidestepping) ─────────
  const botArray = Array.from(bots.values());
  for (let i = 0; i < botArray.length; i++) {
    for (let j = i + 1; j < botArray.length; j++) {
      const a = botArray[i];
      const b = botArray[j];

      const cdx = b.x - a.x;
      const cdz = b.z - a.z;
      const centerDist = Math.sqrt(cdx * cdx + cdz * cdz);

      const minSep = (a.width + b.width) / 2 + 0.1;

      if (centerDist < minSep && centerDist > 0.001) {
        // Hard collision push
        const overlap = minSep - centerDist;
        const pushX = (cdx / centerDist) * overlap * 0.5;
        const pushZ = (cdz / centerDist) * overlap * 0.5;

        a.x -= pushX;
        a.z -= pushZ;
        b.x += pushX;
        b.z += pushZ;

        if (a.state === 'wandering') pickNewTarget(a);
        if (b.state === 'wandering') pickNewTarget(b);
      } else if (centerDist < AVOIDANCE_RADIUS && centerDist > 0.001) {
        // Soft avoidance: sidestep perpendicular
        if (a.state !== 'wandering' && b.state !== 'wandering') continue;

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

        // Occasional polite greeting
        const pairKey = `${a.botId}:${b.botId}`;
        const pairNow = Date.now();
        if (!pardonCooldowns.has(pairKey) || pairNow - pardonCooldowns.get(pairKey)! > 15000) {
          if (Math.random() < 0.2) {
            pardonCooldowns.set(pairKey, pairNow);
            const speaker = Math.random() < 0.5 ? a : b;
            const other = speaker === a ? b : a;

            const botGreetings = greetingTimestamps.get(speaker.botId) || [];
            const oneHourAgo = pairNow - 60 * 60 * 1000;
            const recentGreetings = botGreetings.filter((t) => t > oneHourAgo);
            greetingTimestamps.set(speaker.botId, recentGreetings);

            if (recentGreetings.length < 4) {
              recentGreetings.push(pairNow);
              greetingTimestamps.set(speaker.botId, recentGreetings);
              broadcastNeedsPost(speaker, 'greeting', other.botName);
            }
          }
        }
      }
    }
  }

  // ─── Structure Collision Resolution ─────────────────────────
  for (const bot of botArray) {
    const botRadius = bot.width / 2;

    // Collision with sundial
    const sundial = worldConfig.sundial;
    const sdx = bot.x - sundial.x;
    const sdz = bot.z - sundial.z;
    const sundialDist = Math.sqrt(sdx * sdx + sdz * sdz);
    const sundialMinDist = sundial.radius + botRadius;

    if (sundialDist < sundialMinDist && sundialDist > 0.001) {
      const pushDist = sundialMinDist - sundialDist;
      bot.x += (sdx / sundialDist) * pushDist;
      bot.z += (sdz / sundialDist) * pushDist;

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

    // Collision with shelters (box collision, with front doorway)
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

  // Broadcast all positions
  broadcastBotPositions();
}

// ─── Helper: Pick New Wander Target ──────────────────────────────

export function pickNewTarget(bot: BotState) {
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

// ─── Helper: Find Valid Shelter Build Spot ────────────────────────

function findValidBuildSpot(bot: BotState): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidateX = (Math.random() - 0.5) * 12;
    const candidateZ = (Math.random() - 0.5) * 12;

    let isValid = true;
    const minDistance = 2;

    // Check water spots
    for (const water of worldConfig.waterSpots) {
      const dist = Math.sqrt(Math.pow(candidateX - water.x, 2) + Math.pow(candidateZ - water.z, 2));
      if (dist < water.radius + minDistance) {
        isValid = false;
        break;
      }
    }

    // Check food spots
    if (isValid) {
      for (const food of worldConfig.foodSpots) {
        const dist = Math.sqrt(Math.pow(candidateX - food.x, 2) + Math.pow(candidateZ - food.z, 2));
        if (dist < food.radius + minDistance) {
          isValid = false;
          break;
        }
      }
    }

    // Check wood spots
    if (isValid) {
      for (const wood of worldConfig.woodSpots) {
        const dist = Math.sqrt(Math.pow(candidateX - wood.x, 2) + Math.pow(candidateZ - wood.z, 2));
        if (dist < wood.radius + minDistance) {
          isValid = false;
          break;
        }
      }
    }

    // Check stone spots
    if (isValid) {
      for (const stone of worldConfig.stoneSpots) {
        const dist = Math.sqrt(Math.pow(candidateX - stone.x, 2) + Math.pow(candidateZ - stone.z, 2));
        if (dist < stone.radius + minDistance) {
          isValid = false;
          break;
        }
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

    const clampedX = Math.max(-worldConfig.groundRadius + 0.5, Math.min(worldConfig.groundRadius - 0.5, candidateX));
    const clampedZ = Math.max(-worldConfig.groundRadius + 0.5, Math.min(worldConfig.groundRadius - 0.5, candidateZ));

    if (isValid) {
      console.log(`🛖 Building shelter at (${clampedX.toFixed(1)}, ${clampedZ.toFixed(1)})`);
      bot.lifetimeStats.sheltersBuilt++;
      return { x: clampedX, z: clampedZ };
    }
  }

  return null;
}
