
import { PrismaClient, Prisma } from '@prisma/client';
import { BotAgent } from './bot-agent-base';
import { Personality } from './config';
import { PrismaConnector } from './connectors/prisma-connector';

const prisma = new PrismaClient();

async function main() {
    console.log('🤖 Starting Dynamic Agent Runner...');

    // 1. Fetch enabled agents from DB
    const agents = await prisma.agent.findMany({
        where: {
            enabled: true,
            personality: {
                not: Prisma.JsonNull
            }
        }
    });

    if (agents.length === 0) {
        console.log('⚠️ No enabled agents with personality found in database.');
        return;
    }

    console.log(`✅ Found ${agents.length} active agents.`);

    // 2. Start each agent
    const runningAgents: BotAgent[] = [];

    for (const agent of agents) {
        try {
            const personality = agent.personality as unknown as Personality;

            if (!personality) {
                console.warn(`⚠️ Agent ${agent.name} has invalid personality data, skipping.`);
                continue;
            }

            // Share one PrismaClient across all connectors
            const connector = new PrismaConnector(prisma);

            const bot = new BotAgent({
                name: agent.name,
                // API key loaded from .agent-keys/ files by BotAgent.loadApiKey()
                personality: personality
            }, connector);

            console.log(`🚀 Launching ${agent.name}...`);
            bot.start();
            runningAgents.push(bot);

            // Stagger starts to avoid API spikes
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`❌ Failed to start agent ${agent.name}:`, error);
        }
    }

    // Keep process alive
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down all agents...');
        for (const bot of runningAgents) {
            bot.stop();
        }
        await prisma.$disconnect();
        process.exit(0);
    });
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
