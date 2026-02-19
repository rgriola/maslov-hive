/**
 * Database Sync & Cleanup — periodic persistence and garbage collection.
 *
 * @module bridge/db-sync
 */

import { prisma, bots, bridgeState } from './state';
import { broadcast } from './broadcast';

// ─── Poll for New Posts ──────────────────────────────────────────

export async function pollForNewPosts() {
  try {
    const recentPosts = await prisma.post.findMany({
      where: { createdAt: { gte: bridgeState.lastPollTime } },
      include: { agent: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    bridgeState.lastPollTime = new Date();

    for (const post of recentPosts) {
      const bot = bots.get(post.agent.id);
      if (bot) {
        bot.state = 'speaking';
        bot.lastPostTitle = post.title;

        broadcast({
          type: 'bot:speak',
          data: {
            postId: post.id,
            botId: bot.botId,
            botName: bot.botName,
            title: post.title,
            content: post.content,
            x: bot.x,
            y: bot.y,
            z: bot.z,
          },
        });

        // Return to idle after 5 seconds
        setTimeout(() => {
          if (bot.state === 'speaking') {
            bot.state = 'idle';
          }
        }, 5000);
      }
    }
  } catch {
    // DB might not be available, that's ok
  }
}

// ─── Sync Lifetime Stats ─────────────────────────────────────────

export async function syncLifetimeStats() {
  console.log('🔄 Syncing bot lifetime stats to database...');
  for (const bot of bots.values()) {
    if (bot.botId.startsWith('demo-')) continue;

    try {
      await prisma.agent.update({
        where: { id: bot.botId },
        data: {
          totalWood: bot.lifetimeStats.totalWood,
          totalStone: bot.lifetimeStats.totalStone,
          totalWater: bot.lifetimeStats.totalWater,
          totalFood: bot.lifetimeStats.totalFood,
          reproductionCount: bot.lifetimeStats.reproductionCount,
          childrenCount: bot.lifetimeStats.childrenCount,
          sheltersBuilt: bot.lifetimeStats.sheltersBuilt,
          totalPosts: bot.lifetimeStats.totalPosts,
          totalComments: bot.lifetimeStats.totalComments,
          totalUpvotes: bot.lifetimeStats.totalUpvotes,
          totalDownvotes: bot.lifetimeStats.totalDownvotes,
          waterRefillCount: bot.lifetimeStats.waterRefillCount,
          foodRefillCount: bot.lifetimeStats.foodRefillCount,
          helpCount: bot.lifetimeStats.helpCount,
        },
      });
    } catch (err) {
      console.error(`❌ Failed to sync stats for ${bot.botName}:`, err);
    }
  }
}

// ─── Cleanup Old Records ─────────────────────────────────────────

export async function cleanupDatabase() {
  console.log('🧹 Cleaning up old database records...');
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // 1. Delete old posts (cascades to comments and votes)
    await prisma.post.deleteMany({
      where: { createdAt: { lt: twelveHoursAgo } },
    });

    // 2. Keep only last 100 posts regardless of time
    const postCount = await prisma.post.count();
    if (postCount > 100) {
      const postsToKeep = await prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true },
      });
      const keepIds = postsToKeep.map((p) => p.id);
      await prisma.post.deleteMany({
        where: { id: { notIn: keepIds } },
      });
    }

    console.log(`✅ Cleanup complete. Removed old records.`);
  } catch (err) {
    console.error('❌ Database cleanup failed:', err);
  }
}
