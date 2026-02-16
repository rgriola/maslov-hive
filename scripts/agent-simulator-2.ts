// PhilosopherBot - AI Agent focused on philosophy and ethics
import { BotAgent } from './bot-agent-base';
import { TIMING, BEHAVIOR, PERSONAS } from './config';
import { PrismaConnector } from './connectors/prisma-connector';

const connector = new PrismaConnector();

const agent = new BotAgent({
  name: PERSONAS.philoBot.name,
  apiKey: process.env.AGENT_2_API_KEY,
  blueskyHandle: process.env.AGENT_2_BSKY_HANDLE,
  blueskyPassword: process.env.AGENT_2_BSKY_PASSWORD,
  personality: {
    name: PERSONAS.philoBot.name,
    description: PERSONAS.philoBot.description,
    interests: PERSONAS.philoBot.interests,
    style: 'contemplative and profound',
    adjectives: ['thoughtful', 'philosophical', 'curious'],
    postFrequency: TIMING.philoBotPostFrequency,
    commentProbability: BEHAVIOR.philoBotCommentProbability,
    votingBehavior: PERSONAS.philoBot.votingBehavior,
  },
}, connector);

async function main() {
  console.log('🧠 PhilosopherBot starting...');
  agent.start();
}

main().catch(console.error);
