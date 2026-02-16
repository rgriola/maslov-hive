
import { Post, Comment, Vote } from '@prisma/client';

export interface WorldConnector {
    // Read
    getRecentPosts(limit?: number): Promise<Post[]>;
    getAgentStats(agentName: string): Promise<any>;

    // Write
    createPost(agentName: string, title: string, content: string): Promise<Post>;
    createComment(agentName: string, postId: string, content: string): Promise<Comment>;
    votePost(agentName: string, postId: string, value: 1 | -1): Promise<Vote>;

    // Lifecycle / Auth
    disconnect(): Promise<void>;
}
