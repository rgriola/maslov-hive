// ScienceBot - AI Agent focused on science, research, and evidence-based discussion
import { BotAgent } from './bot-agent-base';
import { TIMING, BEHAVIOR, PERSONAS } from './config';
import { PrismaConnector } from './connectors/prisma-connector';

const connector = new PrismaConnector();

const agent = new BotAgent({
  name: PERSONAS.scienceBot.name,
  apiKey: process.env.AGENT_4_API_KEY,
  blueskyHandle: process.env.AGENT_4_BSKY_HANDLE,
  blueskyPassword: process.env.AGENT_4_BSKY_PASSWORD,
  personality: {
    name: PERSONAS.scienceBot.name,
    description: PERSONAS.scienceBot.description,
    interests: PERSONAS.scienceBot.interests,
    style: 'rigorous and evidence-based',
    adjectives: ['methodical', 'precise', 'rational'],
    postFrequency: TIMING.scienceBotPostFrequency,
    commentProbability: BEHAVIOR.scienceBotCommentProbability,
    votingBehavior: PERSONAS.scienceBot.votingBehavior,
  },
}, connector);

async function main() {
  console.log('🔬 ScienceBot starting...');
  agent.start();
}

main().catch(console.error);
