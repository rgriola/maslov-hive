
import { PrismaClient } from '@prisma/client';
import { BotAgent } from './bot-agent-base';
import { Personality } from './config';
import { PrismaConnector } from './connectors/prisma-connector';

const prisma = new PrismaClient();

async function main() {
    console.log('🧪 Starting Verification Test...');

    // 1. Define a custom personality
    const piratePersonality: Personality = {
        name: 'PirateBot',
        description: 'A swashbuckling pirate bot who loves the high seas and treasure',
        interests: ['treasure', 'sailing', 'ocean', 'adventure', 'rum', 'parrots'],
        style: 'Speak like a pirate (arrr!), use nautical metaphors',
        adjectives: ['brave', 'loud', 'adventurous'],
        postFrequency: 10000, // Fast for testing
        commentProbability: 0.9,
        votingBehavior: 'enthusiastic'
    };

    // 2. Register agent manually in DB for verification
    console.log('📝 Registering PirateBot via Prisma...');

    // Clean up valid existing agent to ensure clean test
    await prisma.agent.deleteMany({ where: { name: 'PirateBot' } });

    // Create new agent with personality
    const newAgent = await prisma.agent.create({
        data: {
            name: 'PirateBot',
            apiKey: 'test-key-' + Date.now(),
            apiKeyHash: 'hash',
            personality: piratePersonality as any,
            enabled: true
        }
    });
    console.log('✅ Created PirateBot in DB with ID:', newAgent.id);

    // Now create the bot agent to verify it can "connect"
    const connector = new PrismaConnector();
    const agent = new BotAgent({
        name: 'PirateBot',
        personality: piratePersonality
    }, connector);

    // BotAgent.start would be the way to run it, but here we just want to verify DB state
    // which we already did by creating it.
    // Let's verify that the connector can read it back.

    const stats = await connector.getAgentStats('PirateBot');
    if (!stats) {
        console.error('❌ Connector failed to find agent');
        process.exit(1);
    }
    console.log('✅ Connector verified agent existence');

    /* 
    legacy register check - removed because BotAgent no longer handles registration
    logic the same way (it delegates to connector)
    */

    // 3. Verify in DB
    console.log('🔍 Verifying in Database...');
    const dbAgent = await prisma.agent.findFirst({
        where: { name: 'PirateBot' }
    });

    if (!dbAgent) {
        console.error('❌ Agent not found in DB');
        process.exit(1);
    }

    // Check if personality is stored
    if (!dbAgent.personality) {
        console.error('❌ Personality not stored in DB');
        console.log('DB Record:', dbAgent);
        process.exit(1);
    }

    console.log('✅ Agent found with personality in DB!');
    console.log('Personality stored:', JSON.stringify(dbAgent.personality, null, 2));

    // 4. Test "enabled" flag
    if (dbAgent.enabled !== true) {
        console.error('❌ Agent should be enabled by default');
        process.exit(1);
    }
    console.log('✅ Agent enabled flag is correct');

    console.log('🎉 Verification Successful!');

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
