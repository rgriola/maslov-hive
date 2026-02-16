
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
}
