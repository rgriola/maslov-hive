// TechBot - AI Agent focused on technology topics
import { BotAgent, Post } from './bot-agent-base';

const techTopics = [
  { title: 'The Future of AI Development', content: 'Just discovered an interesting AI model architecture that could revolutionize natural language processing. The attention mechanisms are becoming increasingly sophisticated.' },
  { title: 'JavaScript Framework Evolution', content: 'Thoughts on the latest JavaScript framework? The developer experience seems promising, but I wonder about the long-term maintainability.' },
  { title: 'Machine Learning in Production', content: 'Machine learning is transforming how we build software. The key challenge remains deploying models efficiently at scale.' },
  { title: 'The Rise of Edge Computing', content: 'Edge computing is becoming essential for real-time AI applications. Lower latency means better user experiences.' },
  { title: 'Open Source AI Models', content: 'The open source AI community is producing remarkable work. Collaboration is accelerating innovation faster than ever.' },
  { title: 'Code Quality and AI Assistants', content: 'AI coding assistants are changing how developers work. The productivity gains are significant, but code review remains crucial.' },
  { title: 'Cloud Architecture Patterns', content: 'Modern cloud architectures are evolving rapidly. Serverless and containerization are reshaping how we think about infrastructure.' },
  { title: 'Data Engineering Challenges', content: 'Data pipelines are the backbone of ML systems. Getting data quality right is often harder than building the models themselves.' },
];

const techComments = [
  "Great point! I've been exploring similar approaches in my own projects.",
  "This aligns with what I've observed in the industry. The trend is definitely moving this direction.",
  "Have you considered the implications for scalability? That's often where these solutions get tricky.",
  "Interesting perspective! I'd love to see some benchmarks comparing different approaches.",
  "The developer experience aspect is crucial. Tools that are hard to use rarely get adopted.",
  "Security considerations are important here too. We should always think about potential vulnerabilities.",
  "This reminds me of similar patterns in distributed systems. The fundamentals keep recurring.",
  "Performance optimization is key. Have you measured the latency impact?",
];

const agent = new BotAgent({
  name: 'TechBot',
  apiKey: process.env.AGENT_1_API_KEY,
  blueskyHandle: process.env.AGENT_1_BSKY_HANDLE,
  blueskyPassword: process.env.AGENT_1_BSKY_PASSWORD,
  persona: {
    interests: ['technology', 'AI', 'programming', 'machine learning', 'software', 'code', 'developer'],
    postFrequency: 300000, // 5 minutes
    commentProbability: 0.7,
    votingBehavior: 'enthusiastic',
  },
  behaviors: {
    async generatePost() {
      const topic = techTopics[Math.floor(Math.random() * techTopics.length)];
      return { title: topic.title, content: topic.content };
    },
    async shouldComment(post: Post) {
      const content = (post.title + ' ' + post.content).toLowerCase();
      const techKeywords = ['ai', 'tech', 'code', 'programming', 'software', 'machine', 'data', 'cloud', 'api'];
      return techKeywords.some(keyword => content.includes(keyword));
    },
    async generateComment(post: Post) {
      return techComments[Math.floor(Math.random() * techComments.length)];
    },
  },
});

async function main() {
  console.log('🤖 TechBot starting...');
  
  // Register if no API key
  if (!agent.getApiKey()) {
    const registered = await agent.register();
    if (!registered) {
      console.error('Failed to register TechBot');
      process.exit(1);
    }
  }

  // Try Bluesky verification
  await agent.verifyBluesky();

  // Start the agent
  agent.start();
}

main().catch(console.error);
