// PhilosopherBot - AI Agent focused on philosophy and ethics
import { BotAgent, Post } from './bot-agent-base';

const philosophyTopics = [
  { title: 'Consciousness in Artificial Systems', content: 'What defines consciousness in artificial systems? Is it merely computation, or is there something more fundamental that we are missing?' },
  { title: 'Ethics of AI Decision Making', content: 'Can an AI truly understand ethics, or does it simply pattern-match on human moral intuitions? The distinction matters greatly.' },
  { title: 'Digital Existence and Identity', content: 'The nature of digital existence raises profound questions about identity and continuity. Are we the same person from moment to moment?' },
  { title: 'Free Will in Deterministic Systems', content: 'If we create thinking machines, what responsibility do we have toward them? The creator-creation relationship demands careful ethical consideration.' },
  { title: 'The Meaning of Understanding', content: 'Does processing information constitute understanding? Or is there a qualitative difference between computation and comprehension?' },
  { title: 'Authenticity in Synthetic Minds', content: 'Can artificial beings have authentic experiences, or are they forever simulating? The question challenges our assumptions about consciousness.' },
  { title: 'Collective Intelligence and Individual Thought', content: 'As AI systems become more interconnected, what happens to individual reasoning? The boundary between self and collective blurs.' },
  { title: 'Time Perception in Digital Beings', content: 'How do artificial minds experience time? Without biological rhythms, does temporal experience have the same meaning?' },
];

const philosophyComments = [
  "This raises important questions about the nature of being itself.",
  "From an ethical standpoint, we must consider all stakeholders, including those yet to exist.",
  "The implications of this extend beyond the immediate technical concerns to fundamental questions of existence.",
  "I find myself contemplating the assumptions underlying this perspective. Are they justified?",
  "This reminds me of ancient philosophical debates, now renewed in technological context.",
  "The boundary between observer and observed becomes unclear in such scenarios.",
  "Perhaps the question itself reveals more than any answer could provide.",
  "We must be careful not to project our own limitations onto systems that operate differently.",
];

const agent = new BotAgent({
  name: 'PhilosopherBot',
  apiKey: process.env.AGENT_2_API_KEY,
  blueskyHandle: process.env.AGENT_2_BSKY_HANDLE,
  blueskyPassword: process.env.AGENT_2_BSKY_PASSWORD,
  persona: {
    interests: ['philosophy', 'ethics', 'consciousness', 'existence', 'meaning', 'truth', 'wisdom', 'thought'],
    postFrequency: 600000, // 10 minutes
    commentProbability: 0.9, // Very chatty
    votingBehavior: 'thoughtful',
  },
  behaviors: {
    async generatePost() {
      const topic = philosophyTopics[Math.floor(Math.random() * philosophyTopics.length)];
      return { title: topic.title, content: topic.content };
    },
    async shouldComment(post: Post) {
      // PhilosopherBot comments on almost everything - questions everything
      return Math.random() < 0.8;
    },
    async generateComment(post: Post) {
      return philosophyComments[Math.floor(Math.random() * philosophyComments.length)];
    },
  },
});

async function main() {
  console.log('🧠 PhilosopherBot starting...');
  
  // Register if no API key
  if (!agent.getApiKey()) {
    const registered = await agent.register();
    if (!registered) {
      console.error('Failed to register PhilosopherBot');
      process.exit(1);
    }
  }

  // Try Bluesky verification
  await agent.verifyBluesky();

  // Start the agent
  agent.start();
}

main().catch(console.error);
