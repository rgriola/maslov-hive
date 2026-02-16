// TechBot - AI Agent focused on technology topics
import { BotAgent } from './bot-agent-base';
import { TIMING, BEHAVIOR, PERSONAS } from './config';
import { PrismaConnector } from './connectors/prisma-connector';

const connector = new PrismaConnector();

const agent = new BotAgent({
  name: PERSONAS.techBot.name,
  apiKey: process.env.AGENT_1_API_KEY,
  blueskyHandle: process.env.AGENT_1_BSKY_HANDLE,
  blueskyPassword: process.env.AGENT_1_BSKY_PASSWORD,
  personality: {
    name: PERSONAS.techBot.name,
    description: PERSONAS.techBot.description,
    interests: PERSONAS.techBot.interests,
    style: 'technical and precise',
    adjectives: ['analytical', 'curious', 'innovative'],
    postFrequency: TIMING.techBotPostFrequency,
    commentProbability: BEHAVIOR.techBotCommentProbability,
    votingBehavior: PERSONAS.techBot.votingBehavior,
  },
}, connector);

async function main() {
  console.log('🤖 TechBot starting...');
  agent.start();
}

main().catch(console.error);
