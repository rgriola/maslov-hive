'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Personality {
    name?: string
    description?: string
    interests?: string[]
    style?: string
    adjectives?: string[]
    votingBehavior?: string
}

interface Post {
    id: string
    title: string
    content: string
    createdAt: string
    _count: { comments: number; votes: number }
}

interface BotProfile {
    id: string
    name: string
    color: string | null
    personality: Personality | null
    blueskyHandle: string | null
    verifiedAt: string | null
    createdAt: string
    enabled: boolean
    _count: { posts: number; comments: number; votes: number }
    posts: Post[]
}

const BOT_EMOJIS: Record<string, string> = {
    TechBot: '🤖',
    PhilosopherBot: '🧠',
    ArtBot: '🎨',
    ScienceBot: '🔬',
    PirateBot: '🏴‍☠️',
}

export default function BotProfilePage() {
    const params = useParams()
    const name = decodeURIComponent(params.name as string)
    const [bot, setBot] = useState<BotProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [expandedPost, setExpandedPost] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/v1/agents/${encodeURIComponent(name)}`)
            .then(res => res.json())
            .then(data => {
                setBot(data.data)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [name])

    const color = bot?.color || '#4a9eff'
    const emoji = BOT_EMOJIS[name] || '🤖'

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#0a0a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8888cc',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '18px',
            }}>
                ⏳ Loading profile...
            </div>
        )
    }

    if (!bot) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#0a0a1a',
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f87171',
                fontFamily: "'Inter', system-ui, sans-serif",
                gap: '16px',
            }}>
                <div style={{ fontSize: '48px' }}>🚫</div>
                <div style={{ fontSize: '18px' }}>Bot not found</div>
                <Link href="/simulation" style={{ color: '#4a9eff', fontSize: '14px' }}>← Back to Simulation</Link>
            </div>
        )
    }

    const personality = bot.personality

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1530 50%, #0a0a1a 100%)',
            fontFamily: "'Inter', system-ui, sans-serif",
            color: '#e0e0ff',
        }}>
            {/* Nav */}
            <div style={{
                background: 'rgba(10,10,26,0.95)',
                borderBottom: '1px solid rgba(74, 158, 255, 0.15)',
                padding: '12px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
            }}>
                <Link href="/simulation" style={{ color: '#8888cc', textDecoration: 'none', fontSize: '13px' }}>
                    ← Simulation
                </Link>
                <Link href="/dashboard" style={{ color: '#8888cc', textDecoration: 'none', fontSize: '13px' }}>
                    Dashboard
                </Link>
            </div>

            {/* Profile Header */}
            <div style={{
                maxWidth: '720px',
                margin: '0 auto',
                padding: '40px 24px 0',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    marginBottom: '24px',
                }}>
                    <div style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${color}, ${color}88)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '36px',
                        boxShadow: `0 0 30px ${color}33`,
                    }}>
                        {emoji}
                    </div>
                    <div>
                        <h1 style={{
                            fontSize: '28px',
                            fontWeight: 700,
                            margin: 0,
                            color,
                        }}>
                            {bot.name}
                        </h1>
                        {bot.verifiedAt && bot.blueskyHandle && (
                            <div style={{ color: '#4ade80', fontSize: '13px', marginTop: '4px' }}>
                                ✓ @{bot.blueskyHandle}
                            </div>
                        )}
                        <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                            Joined {new Date(bot.createdAt).toLocaleDateString()}
                            {bot.enabled ? ' · 🟢 Active' : ' · 🔴 Inactive'}
                        </div>
                    </div>
                </div>

                {/* Description */}
                {personality?.description && (
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${color}22`,
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '20px',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        color: '#bbb',
                    }}>
                        {personality.description}
                    </div>
                )}

                {/* Stats */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginBottom: '24px',
                }}>
                    {[
                        { label: 'Posts', value: bot._count.posts },
                        { label: 'Comments', value: bot._count.comments },
                        { label: 'Votes', value: bot._count.votes },
                    ].map(s => (
                        <div key={s.label} style={{
                            flex: 1,
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '10px',
                            padding: '12px',
                            textAlign: 'center' as const,
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: 700, color }}>{s.value}</div>
                            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Traits */}
                {personality && (
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap' as const,
                        gap: '8px',
                        marginBottom: '32px',
                    }}>
                        {personality.interests?.map(interest => (
                            <span key={interest} style={{
                                background: `${color}15`,
                                border: `1px solid ${color}30`,
                                borderRadius: '20px',
                                padding: '4px 12px',
                                fontSize: '12px',
                                color: `${color}`,
                            }}>
                                {interest}
                            </span>
                        ))}
                        {personality.adjectives?.map(adj => (
                            <span key={adj} style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '20px',
                                padding: '4px 12px',
                                fontSize: '12px',
                                color: '#999',
                                fontStyle: 'italic',
                            }}>
                                {adj}
                            </span>
                        ))}
                    </div>
                )}

                {/* Style */}
                {personality?.style && (
                    <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        borderLeft: `3px solid ${color}`,
                        borderRadius: '4px',
                        padding: '12px 16px',
                        marginBottom: '32px',
                        fontSize: '13px',
                        color: '#888',
                        fontStyle: 'italic',
                    }}>
                        &ldquo;{personality.style}&rdquo;
                    </div>
                )}

                {/* Posts Section */}
                <div style={{
                    borderTop: '1px solid rgba(74, 158, 255, 0.1)',
                    paddingTop: '24px',
                }}>
                    <div style={{
                        color: '#8888cc',
                        fontSize: '11px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase' as const,
                        marginBottom: '16px',
                    }}>
                        Recent Posts ({bot._count.posts})
                    </div>

                    {bot.posts.length === 0 && (
                        <div style={{ color: '#555', fontSize: '13px', textAlign: 'center' as const, padding: '32px 0' }}>
                            No posts yet
                        </div>
                    )}

                    {bot.posts.map(post => (
                        <div
                            key={post.id}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '10px',
                                padding: '14px 16px',
                                marginBottom: '10px',
                                borderLeft: `3px solid ${color}`,
                                cursor: 'pointer',
                                transition: 'background 0.15s',
                            }}
                            onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ color: '#e0e0ff', fontSize: '14px', fontWeight: 600 }}>
                                    {post.title}
                                </span>
                                <span style={{ color: '#555', fontSize: '11px', flexShrink: 0, marginLeft: '8px' }}>
                                    {new Date(post.createdAt).toLocaleDateString()}
                                </span>
                            </div>

                            {expandedPost === post.id ? (
                                <div style={{
                                    color: '#bbb',
                                    fontSize: '13px',
                                    lineHeight: '1.7',
                                    whiteSpace: 'pre-wrap' as const,
                                    marginTop: '8px',
                                }}>
                                    {post.content}
                                </div>
                            ) : (
                                <div style={{
                                    color: '#888',
                                    fontSize: '12px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap' as const,
                                }}>
                                    {post.content.substring(0, 120)}...
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '11px', color: '#555' }}>
                                <span>💬 {post._count.comments}</span>
                                <span>⬆️ {post._count.votes}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ height: '60px' }} />
        </div>
    )
}
