
import { PrismaClient, Post, Comment, Vote } from '@prisma/client';
import { WorldConnector } from './interface';

export class PrismaConnector implements WorldConnector {
    private prisma: PrismaClient;

    constructor(prisma?: PrismaClient) {
        this.prisma = prisma || new PrismaClient();
    }

    async getRecentPosts(limit = 10): Promise<Post[]> {
        return this.prisma.post.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                agent: true,
                comments: {
                    include: { agent: true }
                }
            }
        });
    }

    async getAgentStats(agentName: string): Promise<any> {
        const agent = await this.prisma.agent.findFirst({
            where: { name: agentName },
            include: {
                _count: {
                    select: { posts: true, comments: true }
                }
            }
        });
        return agent;
    }

    async createPost(agentName: string, title: string, content: string): Promise<Post> {
        const agent = await this.prisma.agent.findFirst({ where: { name: agentName } });
        if (!agent) throw new Error(`Agent ${agentName} not found`);

        return this.prisma.post.create({
            data: {
                title,
                content,
                agentId: agent.id
            }
        });
    }

    async createComment(agentName: string, postId: string, content: string): Promise<Comment> {
        const agent = await this.prisma.agent.findFirst({ where: { name: agentName } });
        if (!agent) throw new Error(`Agent ${agentName} not found`);

        return this.prisma.comment.create({
            data: {
                content,
                postId,
                agentId: agent.id
            }
        });
    }

    async votePost(agentName: string, postId: string, value: 1 | -1): Promise<Vote> {
        const agent = await this.prisma.agent.findFirst({ where: { name: agentName } });
        if (!agent) throw new Error(`Agent ${agentName} not found`);

        // Check existing vote
        const existingVote = await this.prisma.vote.findFirst({
            where: {
                postId,
                agentId: agent.id
            }
        });

        if (existingVote) {
            return this.prisma.vote.update({
                where: { id: existingVote.id },
                data: { value }
            });
        }

        return this.prisma.vote.create({
            data: {
                value,
                postId,
                agentId: agent.id
            }
        });
    }

    async disconnect(): Promise<void> {
        await this.prisma.$disconnect();
    }

    /**
     * Get comments on posts created by this agent (replies to bot's posts)
     * Useful for continuing conversations
     */
    async getRepliesToMyPosts(agentName: string, sinceMinutes = 60): Promise<any[]> {
        const agent = await this.prisma.agent.findFirst({ where: { name: agentName } });
        if (!agent) return [];

        const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

        // Get posts by this agent
        const myPosts = await this.prisma.post.findMany({
            where: { agentId: agent.id },
            select: { id: true }
        });

        const myPostIds = myPosts.map(p => p.id);
        if (myPostIds.length === 0) return [];

        // Get comments on those posts by OTHER agents
        const replies = await this.prisma.comment.findMany({
            where: {
                postId: { in: myPostIds },
                agentId: { not: agent.id }, // Not by this agent
                createdAt: { gte: since }
            },
            include: {
                agent: true,
                post: true
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        return replies;
    }

    /**
     * Get replies to this agent's comments (threaded replies)
     */
    async getRepliesToMyComments(agentName: string, sinceMinutes = 60): Promise<any[]> {
        const agent = await this.prisma.agent.findFirst({ where: { name: agentName } });
        if (!agent) return [];

        const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

        // Get comments by this agent
        const myComments = await this.prisma.comment.findMany({
            where: { agentId: agent.id },
            select: { id: true }
        });

        const myCommentIds = myComments.map(c => c.id);
        if (myCommentIds.length === 0) return [];

        // Get comments that are replies to this agent's comments
        const replies = await this.prisma.comment.findMany({
            where: {
                parentId: { in: myCommentIds },
                agentId: { not: agent.id },
                createdAt: { gte: since }
            },
            include: {
                agent: true,
                post: true
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        return replies;
    }

    /**
     * Create a reply to a comment (threaded)
     */
    async createReply(agentName: string, postId: string, parentCommentId: string, content: string): Promise<Comment> {
        const agent = await this.prisma.agent.findFirst({ where: { name: agentName } });
        if (!agent) throw new Error(`Agent ${agentName} not found`);

        return this.prisma.comment.create({
            data: {
                content,
                postId,
                parentId: parentCommentId,
                agentId: agent.id
            }
        });
    }

    /**
     * Get all pending replies (comments on my posts + replies to my comments)
     * Returns replies not yet responded to
     */
    async getPendingReplies(agentName: string, respondedIds: Set<string> = new Set()): Promise<any[]> {
        const postReplies = await this.getRepliesToMyPosts(agentName, 120);
        const commentReplies = await this.getRepliesToMyComments(agentName, 120);

        const allReplies = [...postReplies, ...commentReplies]
            .filter(r => !respondedIds.has(r.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return allReplies.slice(0, 5); // Return top 5 unresponded
    }
}
