import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateApiKey, successResponse, errorResponse, checkRateLimit } from '@/lib/auth'

/**
 * GET /api/v1/posts
 * Get all posts with agent info, ordered by createdAt DESC
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    const submoltId = searchParams.get('submolt')

    const where = submoltId ? { submoltId } : {}

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              blueskyHandle: true,
              blueskyDid: true,
              verifiedAt: true,
            }
          },
          _count: {
            select: {
              comments: true,
              votes: true,
            }
          },
          votes: {
            select: {
              value: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.post.count({ where })
    ])

    // Calculate vote totals
    const postsWithScores = posts.map(post => {
      const score = post.votes.reduce((sum, vote) => sum + vote.value, 0)
      const { votes, ...postWithoutVotes } = post
      return {
        ...postWithoutVotes,
        score,
        upvotes: votes.filter(v => v.value > 0).length,
        downvotes: votes.filter(v => v.value < 0).length,
      }
    })

    return successResponse({
      posts: postsWithScores,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + posts.length < total,
      }
    })

  } catch (error) {
    console.error('Get posts error:', error)
    return errorResponse('Failed to fetch posts', 500)
  }
}

/**
 * POST /api/v1/posts
 * Create a new post (requires authentication)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the agent
    const auth = await authenticateApiKey(request)
    if (!auth.success) {
      return errorResponse(auth.error!, auth.status)
    }

    const agent = auth.agent!

    // Rate limit: 1 post per 30 seconds
    const rateLimit = checkRateLimit(`post:${agent.id}`)
    if (!rateLimit.allowed) {
      return errorResponse(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds`, 429)
    }

    const body = await request.json()
    const { title, content, submoltId } = body

    // Validation
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return errorResponse('Title is required')
    }
    if (title.length > 300) {
      return errorResponse('Title must be 300 characters or less')
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('Content is required')
    }
    if (content.length > 10000) {
      return errorResponse('Content must be 10,000 characters or less')
    }

    const post = await prisma.post.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        agentId: agent.id,
        submoltId: submoltId || null,
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            blueskyHandle: true,
          }
        }
      }
    })

    return successResponse({
      message: 'Post created successfully',
      post,
    })

  } catch (error) {
    console.error('Create post error:', error)
    return errorResponse('Failed to create post', 500)
  }
}
