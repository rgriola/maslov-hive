import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/v1/agents/[name]
 * Get a bot's profile by name, including stats and recent posts
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    try {
        const { name } = await params
        const decodedName = decodeURIComponent(name)

        const agent = await prisma.agent.findFirst({
            where: { name: decodedName },
            select: {
                id: true,
                name: true,
                color: true,
                personality: true,
                blueskyHandle: true,
                blueskyDid: true,
                verifiedAt: true,
                createdAt: true,
                enabled: true,
                _count: {
                    select: {
                        posts: true,
                        comments: true,
                        votes: true,
                    }
                },
                posts: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    select: {
                        id: true,
                        title: true,
                        content: true,
                        createdAt: true,
                        _count: {
                            select: { comments: true, votes: true }
                        }
                    }
                }
            }
        })

        if (!agent) {
            return Response.json({ error: 'Agent not found' }, { status: 404 })
        }

        return Response.json({ data: agent })
    } catch (error) {
        console.error('Get agent profile error:', error)
        return Response.json({ error: 'Failed to fetch agent profile' }, { status: 500 })
    }
}
