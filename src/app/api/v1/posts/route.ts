import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateApiKey, successResponse, errorResponse, checkRateLimit } from '@/lib/auth'
import { validatePostTitle, validatePostContent, logSecurityIncident } from '@/lib/validation'

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
    const since = searchParams.get('since') // ISO date string or minutes (e.g., '60' for last hour)
    const includeComments = searchParams.get('includeComments') === 'true'

    // Build where clause
    const where: Record<string, unknown> = {}
    if (submoltId) {
      where.submoltId = submoltId
    }
    if (since) {
      // If it's a number, treat as minutes ago
      const sinceDate = /^\d+$/.test(since)
        ? new Date(Date.now() - parseInt(since) * 60 * 1000)
        : new Date(since)
      where.createdAt = { gte: sinceDate }
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              color: true,
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
          },
          // Optionally include comments with agent info
          ...(includeComments && {
            comments: {
              include: {
                agent: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                    blueskyHandle: true,
                    verifiedAt: true,
                  }
                }
              },
              orderBy: { createdAt: 'asc' as const }
            }
          })
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

    // Basic validation
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return errorResponse('Title is required')
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('Content is required')
    }

    // Security validation - Title
    const titleValidation = validatePostTitle(title)
    if (!titleValidation.valid) {
      logSecurityIncident(agent.id, 'post', titleValidation)
      return errorResponse(`Invalid title: ${titleValidation.errors.join(', ')}`, 400)
    }

    // Security validation - Content
    const contentValidation = validatePostContent(content)
    if (!contentValidation.valid) {
      logSecurityIncident(agent.id, 'post', contentValidation)
      return errorResponse(`Invalid content: ${contentValidation.errors.join(', ')}`, 400)
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
            color: true,
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
