// Bot Physical Needs System
// Based on Maslow's hierarchy - starting with physiological needs

export interface PhysicalNeeds {
  air: number;          // 0-100: Oxygen supply (always 100 for now, future: pollution effects)
  water: number;        // 0-100: Hydration level
  food: number;         // 0-100: Nutrition and energy
  sleep: number;        // 0-100: Rest and recovery
  shelter: number;      // 0-100: Protection from elements
  clothing: number;     // 0-100: Temperature regulation
  homeostasis: number;  // 0-100: Internal balance (temp, pH, etc.)
  reproduction: number; // 0-100: Species propagation drive
}

export interface NeedDecayRates {
  water: number;        // Points lost per minute
  food: number;
  sleep: number;
  shelter: number;      // Context-dependent (weather)
  clothing: number;     // Context-dependent (weather)
  homeostasis: number;  // Affected by other needs
  reproduction: number; // Slower decay
}

// Default decay rates (points per minute)
export const DEFAULT_DECAY_RATES: NeedDecayRates = {
  water: 100,       // ~1 min to go from 100 to 0 (testing)
  food: 50,          // ~2 min to go from 100 to 0 (testing)
  sleep: 25,         // ~4 min to go from 100 to 0 (testing)
  shelter: 0.1,      // Weather-dependent
  clothing: 0.1,     // Weather-dependent
  homeostasis: 0.15, // Affected by other needs
  reproduction: 0.05, // ~33 hours
};

// Thresholds for seeking behavior (when need drops below this, bot seeks)
export const NEED_THRESHOLDS = {
  water: 30,
  food: 25,
  sleep: 20,
  shelter: 15,
  clothing: 15,
  homeostasis: 20,
  reproduction: 10, // Less urgent
};

// Critical thresholds (bot is in distress)
export const CRITICAL_THRESHOLDS = {
  water: 10,
  food: 10,
  sleep: 5,
  homeostasis: 10,
};

/**
 * Initialize needs at healthy levels
 */
export function initializeNeeds(): PhysicalNeeds {
  return {
    air: 100,
    water: 100,
    food: 100,
    sleep: 100,
    shelter: 100,
    clothing: 100,
    homeostasis: 100,
    reproduction: 100,
  };
}

/**
 * Decay needs over time
 * @param needs Current needs
 * @param minutes Elapsed time in minutes
 * @param rates Custom decay rates (optional)
 */
export function decayNeeds(
  needs: PhysicalNeeds,
  minutes: number,
  rates: Partial<NeedDecayRates> = {}
): PhysicalNeeds {
  const effectiveRates = { ...DEFAULT_DECAY_RATES, ...rates };
  
  return {
    air: needs.air, // Air doesn't decay (always available for now)
    water: Math.max(0, needs.water - effectiveRates.water * minutes),
    food: Math.max(0, needs.food - effectiveRates.food * minutes),
    sleep: Math.max(0, needs.sleep - effectiveRates.sleep * minutes),
    shelter: Math.max(0, needs.shelter - effectiveRates.shelter * minutes),
    clothing: Math.max(0, needs.clothing - effectiveRates.clothing * minutes),
    homeostasis: Math.max(0, needs.homeostasis - effectiveRates.homeostasis * minutes),
    reproduction: Math.max(0, needs.reproduction - effectiveRates.reproduction * minutes),
  };
}

/**
 * Fulfill a specific need
 * @param needs Current needs
 * @param needType Type of need to fulfill
 * @param amount Amount to restore (default: full restoration)
 */
export function fulfillNeed(
  needs: PhysicalNeeds,
  needType: keyof PhysicalNeeds,
  amount: number = 100
): PhysicalNeeds {
  return {
    ...needs,
    [needType]: Math.min(100, needs[needType] + amount),
  };
}

/**
 * Get the most urgent need
 */
export function getMostUrgentNeed(needs: PhysicalNeeds): {
  need: keyof PhysicalNeeds | null;
  value: number;
  threshold: number;
} {
  // Check critical needs first (exclude air - always fulfilled)
  const criticalNeeds: (keyof PhysicalNeeds)[] = ['water', 'food', 'sleep', 'homeostasis'];
  
  for (const needKey of criticalNeeds) {
    const threshold = NEED_THRESHOLDS[needKey as keyof typeof NEED_THRESHOLDS];
    if (threshold !== undefined && needs[needKey] < threshold) {
      return { need: needKey, value: needs[needKey], threshold };
    }
  }
  
  // Check other needs
  const otherNeeds: (keyof PhysicalNeeds)[] = ['shelter', 'clothing', 'reproduction'];
  
  for (const needKey of otherNeeds) {
    const threshold = NEED_THRESHOLDS[needKey as keyof typeof NEED_THRESHOLDS];
    if (threshold !== undefined && needs[needKey] < threshold) {
      return { need: needKey, value: needs[needKey], threshold };
    }
  }
  
  return { need: null, value: 100, threshold: 0 };
}

/**
 * Check if bot is in critical condition
 */
export function isInCriticalCondition(needs: PhysicalNeeds): boolean {
  return (
    needs.water < CRITICAL_THRESHOLDS.water ||
    needs.food < CRITICAL_THRESHOLDS.food ||
    needs.sleep < CRITICAL_THRESHOLDS.sleep ||
    needs.homeostasis < CRITICAL_THRESHOLDS.homeostasis
  );
}

/**
 * Get need status emoji
 */
export function getNeedEmoji(needType: keyof PhysicalNeeds): string {
  const emojis: Record<keyof PhysicalNeeds, string> = {
    air: '💨',
    water: '💧',
    food: '🍎',
    sleep: '😴',
    shelter: '🏠',
    clothing: '👕',
    homeostasis: '⚖️',
    reproduction: '💝',
  };
  return emojis[needType];
}

/**
 * Get need status color based on value
 */
export function getNeedColor(value: number): string {
  if (value >= 70) return '#00e400';  // Green - Good
  if (value >= 50) return '#ffff00';  // Yellow - OK
  if (value >= 30) return '#ff7e00';  // Orange - Low
  if (value >= 10) return '#ff0000';  // Red - Critical
  return '#8f3f97';                    // Purple - Emergency
}
