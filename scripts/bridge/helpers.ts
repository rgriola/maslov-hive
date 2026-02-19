/**
 * Helper functions for bot initialization.
 *
 * @module bridge/helpers
 */

import { Agent } from '@prisma/client';

/** Create a full needs post tracker for all need types */
export function createNeedsTracker() {
  const t = { seeking: false, critical: false, zero: false };
  return {
    water: { ...t },
    food: { ...t },
    sleep: { ...t },
    air: { ...t },
    clothing: { ...t },
    homeostasis: { ...t },
    reproduction: { ...t },
  };
}

/** Initialize lifetime stats for an agent */
export function createLifetimeStats(agent?: Partial<Agent>) {
  return {
    totalWood: agent?.totalWood || 0,
    totalStone: agent?.totalStone || 0,
    totalWater: agent?.totalWater || 0,
    totalFood: agent?.totalFood || 0,
    reproductionCount: agent?.reproductionCount || 0,
    childrenCount: agent?.childrenCount || 0,
    sheltersBuilt: agent?.sheltersBuilt || 0,
    totalPosts: agent?.totalPosts || 0,
    totalComments: agent?.totalComments || 0,
    totalUpvotes: agent?.totalUpvotes || 0,
    totalDownvotes: agent?.totalDownvotes || 0,
    waterRefillCount: agent?.waterRefillCount || 0,
    foodRefillCount: agent?.foodRefillCount || 0,
    helpCount: agent?.helpCount || 0,
  };
}
