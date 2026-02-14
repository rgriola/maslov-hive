import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateApiKey, successResponse, errorResponse, checkRateLimit } from '@/lib/auth'
import { validateCommentContent, logSecurityIncident } from '@/lib/validation'

/**
 * GET /api/v1/comments
 * Get comments for a post
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!postId) {
      return errorResponse('postId query parameter is required')
    }

    // Verify post exists
    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      return errorResponse('Post not found', 404)
    }

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { postId },
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
              votes: true,
            }
          },
          votes: {
            select: {
              value: true,
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.comment.count({ where: { postId } })
    ])

    // Calculate vote totals and build threaded structure
    const commentsWithScores = comments.map(comment => {
      const score = comment.votes.reduce((sum, vote) => sum + vote.value, 0)
      const { votes, ...commentWithoutVotes } = comment
      return {
        ...commentWithoutVotes,
        score,
        upvotes: votes.filter(v => v.value > 0).length,
        downvotes: votes.filter(v => v.value < 0).length,
      }
    })

    return successResponse({
      comments: commentsWithScores,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + comments.length < total,
      }
    })

  } catch (error) {
    console.error('Get comments error:', error)
    return errorResponse('Failed to fetch comments', 500)
  }
}

/**
 * POST /api/v1/comments
 * Create a new comment (requires authentication)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the agent
    const auth = await authenticateApiKey(request)
    if (!auth.success) {
      return errorResponse(auth.error!, auth.status)
    }

    const agent = auth.agent!

    // Rate limit: 1 comment per 20 seconds
    const rateLimit = checkRateLimit(`comment:${agent.id}`)
    if (!rateLimit.allowed) {
      return errorResponse(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds`, 429)
    }

    const body = await request.json()
    const { postId, content, parentId } = body

    // Basic validation
    if (!postId || typeof postId !== 'string') {
      return errorResponse('postId is required')
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('Content is required')
    }

    // Security validation
    const contentValidation = validateCommentContent(content)
    if (!contentValidation.valid) {
      logSecurityIncident(agent.id, 'comment', contentValidation)
      return errorResponse(`Invalid content: ${contentValidation.errors.join(', ')}`, 400)
    }

    // Verify post exists
    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      return errorResponse('Post not found', 404)
    }

    // Verify parent comment exists if provided
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({ where: { id: parentId } })
      if (!parentComment) {
        return errorResponse('Parent comment not found', 404)
      }
      if (parentComment.postId !== postId) {
        return errorResponse('Parent comment must be on the same post', 400)
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        agentId: agent.id,
        postId,
        parentId: parentId || null,
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
      message: 'Comment created successfully',
      comment,
    })

  } catch (error) {
    console.error('Create comment error:', error)
    return errorResponse('Failed to create comment', 500)
  }
}
