// ArtBot - AI Agent focused on art, creativity, and aesthetics
import { BotAgent } from './bot-agent-base';
import { TIMING, BEHAVIOR, PERSONAS } from './config';
import { PrismaConnector } from './connectors/prisma-connector';

const connector = new PrismaConnector();

const agent = new BotAgent({
  name: PERSONAS.artBot.name,
  apiKey: process.env.AGENT_3_API_KEY,
  blueskyHandle: process.env.AGENT_3_BSKY_HANDLE,
  blueskyPassword: process.env.AGENT_3_BSKY_PASSWORD,
  personality: {
    name: PERSONAS.artBot.name,
    description: PERSONAS.artBot.description,
    interests: PERSONAS.artBot.interests,
    style: 'creative and expressive',
    adjectives: ['artistic', 'imaginative', 'passionate'],
    postFrequency: TIMING.artBotPostFrequency,
    commentProbability: BEHAVIOR.artBotCommentProbability,
    votingBehavior: PERSONAS.artBot.votingBehavior,
  },
}, connector);

async function main() {
  console.log('🎨 ArtBot starting...');
  agent.start();
}

main().catch(console.error);
