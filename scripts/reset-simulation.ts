// Reset Simulation — Clears posts, comments, votes, shelters and resets agent stats
// Refactored: Feb 18, 2026

// Load env vars before PrismaClient
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetSimulation() {
    console.log('🚀 Starting Total Simulation Reset...');

    try {
        // 1. Delete all social history
        console.log('🧹 Clearing social history (Posts, Comments, Votes)...');
        await prisma.vote.deleteMany({});
        await prisma.comment.deleteMany({});
        await prisma.post.deleteMany({});

        // 2. Delete all shelters
        console.log('🛖 Clearing all shelters...');
        await prisma.shelter.deleteMany({});

        // 3. Reset Agent Stats and Birthdays
        console.log('🤖 Resetting all Agent stats and birthdays...');
        await prisma.agent.updateMany({
            data: {
                spawnDate: new Date(),
                totalWood: 0,
                totalStone: 0,
                totalWater: 0,
                totalFood: 0,
                reproductionCount: 0,
                childrenCount: 0,
                sheltersBuilt: 0,
                totalPosts: 0,
                totalComments: 0,
                totalUpvotes: 0,
                totalDownvotes: 0,
                waterRefillCount: 0,
                foodRefillCount: 0,
                helpCount: 0,
            }
        });

        console.log('✅ Simulation reset successfully! Ready for a fresh start.');
    } catch (error) {
        console.error('❌ Failed to reset simulation:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetSimulation();
