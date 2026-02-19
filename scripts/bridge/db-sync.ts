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
    // 1. Fetch new posts
    const recentPosts = await prisma.post.findMany({
      where: { createdAt: { gte: bridgeState.lastPollTime } },
      include: { agent: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 2. Fetch new comments
    const recentComments = await prisma.comment.findMany({
      where: { createdAt: { gte: bridgeState.lastPollTime } },
      include: { agent: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const allNewItems = [
      ...recentPosts.map(p => ({ ...p, itemType: 'post' as const })),
      ...recentComments.map(c => ({ ...c, itemType: 'comment' as const }))
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (allNewItems.length > 0) {
      // Update poll time to just after the latest item found
      const latestItem = allNewItems[allNewItems.length - 1];
      bridgeState.lastPollTime = new Date(latestItem.createdAt.getTime() + 1);

      for (const item of allNewItems) {
        const bot = bots.get(item.agent.id);
        if (bot) {
          bot.state = 'speaking';
          const title = item.itemType === 'post' ? (item as any).title : (item as any).content.substring(0, 50);
          bot.lastPostTitle = title;

          broadcast({
            type: 'bot:speak',
            data: {
              postId: item.itemType === 'post' ? item.id : (item as any).postId,
              commentId: item.itemType === 'comment' ? item.id : undefined,
              parentId: item.itemType === 'comment' ? (item as any).parentId : undefined,
              botId: bot.botId,
              botName: bot.botName,
              botColor: bot.color,
              title: title,
              content: item.content,
              time: item.createdAt.toISOString(),
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
    }
  } catch (err) {
    console.error('⚠️ DB Poller error:', err);
  }
}

// ─── Sync Lifetime Stats ─────────────────────────────────────────

export async function syncLifetimeStats() {
  console.log('🔄 Syncing bot lifetime stats to database...');
  for (const bot of bots.values()) {
    // Sync stats for all active bots in the simulation

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
