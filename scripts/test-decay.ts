#!/usr/bin/env npx tsx
/**
 * Test harness for bot needs decay formulas.
 *
 * Usage:
 *   npx tsx scripts/test-decay.ts              # full report
 *   npx tsx scripts/test-decay.ts --scenario 2 # run single scenario
 *
 * No DB, WebSocket, or server required — pure function tests.
 */

import {
  initializeNeeds,
  decayNeeds,
  fulfillNeed,
  getMostUrgentNeed,
  isInCriticalCondition,
  DEFAULT_DECAY_RATES,
  NEED_THRESHOLDS,
  CRITICAL_THRESHOLDS,
  type PhysicalNeeds,
} from './bot-needs';

// ─── Helpers ────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toFixed(1).padStart(5);
}

function header(title: string) {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(72));
  console.log('  Legend: 💨 Air  💧 Water  🍎 Food  😴 Sleep  ⚖️ Homeostasis  👕 Clothing  🏠 Shelter  💝 Reproduction');
  console.log('─'.repeat(72));
}

function printRow(t: number, n: PhysicalNeeds, extra = '') {
  const urgent = getMostUrgentNeed(n);
  const critical = isInCriticalCondition(n);
  const flags = [
    urgent.need ? `URGENT: ${urgent.need}=${fmt(urgent.value)}` : '',
    critical ? '⚠️  CRITICAL' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' | ');

  console.log(
    `  t=${String(t).padStart(3)}m | 💨${fmt(n.air)} 💧${fmt(n.water)} 🍎${fmt(n.food)} 😴${fmt(n.sleep)} ⚖️${fmt(n.homeostasis)} 👕${fmt(n.clothing)} 🏠${fmt(n.shelter)} 💝${fmt(n.reproduction)}` +
      (flags ? `  │ ${flags}` : ''),
  );
}

// ─── Temperature & AQI modifier (inlined — no bridge state dependency) ──

function tempModifier(tempC: number): number {
  if (tempC > 35 || tempC < 0) return 3.0;
  if (tempC > 30 || tempC < 5) return 2.0;
  return 1.0;
}

function aqiModifier(aqi: number): number {
  if (aqi < 50) return 0.95;
  if (aqi > 150) return 1.05;
  return 1.0;
}

// ─── Scenarios ──────────────────────────────────────────────────

function scenario1() {
  header('Scenario 1 — Default Decay (idle bot, mild weather)');
  console.log(`  Rates: water=${DEFAULT_DECAY_RATES.water}  food=${DEFAULT_DECAY_RATES.food}  sleep=${DEFAULT_DECAY_RATES.sleep}  shelter=${DEFAULT_DECAY_RATES.shelter}  clothing=${DEFAULT_DECAY_RATES.clothing}  homeostasis=${DEFAULT_DECAY_RATES.homeostasis}  reproduction=${DEFAULT_DECAY_RATES.reproduction} (pts/min)`);

  const dt = 2;
  let n = initializeNeeds();
  for (let t = 0; t <= 20; t += dt) {
    printRow(t, n);
    n = decayNeeds(n, dt);
  }
}

function scenario2() {
  header('Scenario 2 — Labor Decay (gathering wood, 2.5× water+food)');
  const LABOR = 2.5;
  const dt = 2;
  let n = initializeNeeds();
  for (let t = 0; t <= 20; t += dt) {
    printRow(t, n);
    n = decayNeeds(n, dt, {
      water: 100 * LABOR,   // metabolism.ts uses 100 * laborMultiplier
      food: 50 * LABOR,     // metabolism.ts uses 50 * laborMultiplier
    });
  }
}

function scenario3() {
  header('Scenario 3 — Extreme Weather (40°C, AQI 200)');
  const temp = 40;
  const aqi = 200;
  const tMod = tempModifier(temp);
  const aMod = aqiModifier(aqi);
  console.log(`  temp=${temp}°C → modifier=${tMod}  |  AQI=${aqi} → modifier=${aMod}`);

  const dt = 2;
  let n = initializeNeeds();
  for (let t = 0; t <= 20; t += dt) {
    printRow(t, n);
    n = decayNeeds(n, dt, {
      homeostasis: 2 * tMod * aMod,  // BASE_HOMEOSTASIS_DECAY * tMod * aMod
    });
  }
}

function scenario4() {
  header('Scenario 4 — Recovery Test (drink water + eat at t=10)');
  const dt = 2;
  let n = initializeNeeds();

  for (let t = 0; t <= 20; t += dt) {
    if (t === 10) {
      n = fulfillNeed(n, 'water', 60);
      n = fulfillNeed(n, 'food', 40);
      printRow(t, n, '🔄 RECOVERED water+60, food+40');
    } else {
      printRow(t, n);
    }
    n = decayNeeds(n, dt);
  }
}

function scenario5() {
  header('Scenario 5 — Sleep Cycle (sleeping bot: no food/water decay, homeostasis recovers)');
  const SLEEPING_HOMEOSTASIS_RECOVERY = 8.0;
  const dt = 2;
  // Start with partially depleted needs
  let n = decayNeeds(initializeNeeds(), 10);
  console.log('  Starting after 10 min of idle decay → sleeping now');

  for (let t = 0; t <= 20; t += dt) {
    printRow(t, n, t === 0 ? '💤 SLEEP START' : '');
    // Sleeping: no water/food decay, homeostasis recovery
    n = decayNeeds(n, dt, { water: 0, food: 0 });
    n = fulfillNeed(n, 'homeostasis', SLEEPING_HOMEOSTASIS_RECOVERY * dt);
  }
}

function scenario6() {
  header('Scenario 6 — Time to Critical (how long until each need hits critical?)');
  console.log(`  Thresholds: ${JSON.stringify(NEED_THRESHOLDS)}`);
  console.log(`  Critical:   ${JSON.stringify(CRITICAL_THRESHOLDS)}`);
  console.log();

  const needs: (keyof PhysicalNeeds)[] = ['air', 'water', 'food', 'sleep', 'shelter', 'clothing', 'homeostasis', 'reproduction'];
  for (const need of needs) {
    const rate = DEFAULT_DECAY_RATES[need as keyof typeof DEFAULT_DECAY_RATES];
    if (!rate) continue;
    const thresholdMin = (100 - (NEED_THRESHOLDS[need as keyof typeof NEED_THRESHOLDS] ?? 0)) / rate;
    const criticalMin = (100 - (CRITICAL_THRESHOLDS[need as keyof typeof CRITICAL_THRESHOLDS] ?? 0)) / rate;
    const zeroMin = 100 / rate;
    console.log(
      `  ${need.padEnd(14)} rate=${String(rate).padStart(4)}/min → ` +
        `threshold at ${thresholdMin.toFixed(0).padStart(4)}m  |  critical at ${criticalMin.toFixed(0).padStart(4)}m  |  zero at ${zeroMin.toFixed(0).padStart(4)}m`,
    );
  }
}

// ─── Main ───────────────────────────────────────────────────────

const scenarios = [scenario1, scenario2, scenario3, scenario4, scenario5, scenario6];

const arg = process.argv.find((a) => a.startsWith('--scenario'));
const idx = arg ? parseInt(process.argv[process.argv.indexOf(arg) + 1]) : null;

if (idx !== null && idx >= 1 && idx <= scenarios.length) {
  scenarios[idx - 1]();
} else {
  scenarios.forEach((fn) => fn());
}

console.log();
