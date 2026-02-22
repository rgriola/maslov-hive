/**
 * CommentThread — shared comment list component.
 * Renders PostComment[] with agent name links, optional avatars, dates,
 * and renderContentWithLinks. Used by dashboard and PostDetailPanel (simulation).
 * Refactored: 2026-02-21 — Phase 3 shared UI components
 */

'use client';

import Link from 'next/link';
import type { PostComment } from '@/types/post';
import { renderContentWithLinks } from '@/utils/content';

/** Theme overrides for non-Tailwind contexts (e.g. PostDetailPanel) */
export interface CommentThreadTheme {
  cardBg?: string;
  borderColor?: string;
  textColor?: string;
  textSecondary?: string;
  textMuted?: string;
}

export interface CommentThreadProps {
  comments: PostComment[];
  /** Show colored avatar circles with agent initial (default: false) */
  showAvatar?: boolean;
  /** Show timestamps (default: true) */
  showDate?: boolean;
  /** Date formatter — receives ISO string, returns display string */
  formatDate?: (date: string) => string;
  /** Show verified Bluesky badge (default: false) */
  showVerifiedBadge?: boolean;
  /** Use renderContentWithLinks for comment content (default: true) */
  useContentLinks?: boolean;
  /** Message shown when comments array is empty */
  emptyMessage?: string;
  /** Theme overrides for inline-styled contexts */
  theme?: CommentThreadTheme;
  /** Tailwind class for the outer container */
  className?: string;
  /** Tailwind class for each comment card */
  commentClassName?: string;
}

const defaultDateFormat = (date: string) =>
  new Date(date).toLocaleTimeString();

export function CommentThread({
  comments,
  showAvatar = false,
  showDate = true,
  formatDate = defaultDateFormat,
  showVerifiedBadge = false,
  useContentLinks = true,
  emptyMessage = 'No comments yet',
  theme,
  className,
  commentClassName,
}: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <div
        className={className}
        style={theme ? { color: theme.textMuted || theme.textSecondary, fontSize: '12px', fontStyle: 'italic' } : undefined}
      >
        <span className={!theme ? 'text-purple-300 text-sm italic' : undefined}>
          {emptyMessage}
        </span>
      </div>
    );
  }

  // Inline-styled rendering (for PostDetailPanel or bot profile)
  if (theme) {
    return (
      <div className={className}>
        {comments.map(comment => (
          <div
            key={comment.id}
            className={commentClassName}
            style={{
              background: theme.cardBg,
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '8px',
              borderLeft: `2px solid ${theme.borderColor || '#333'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <a
                href={`/bot/${encodeURIComponent(comment.agent.name)}`}
                style={{
                  color: theme.textSecondary,
                  fontSize: '11px',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {comment.agent.name}
              </a>
              {showDate && (
                <span style={{ color: theme.textSecondary, fontSize: '10px' }}>
                  {formatDate(comment.createdAt)}
                </span>
              )}
            </div>
            <div style={{
              color: theme.textColor || '#ccc',
              fontSize: '12px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {useContentLinks ? renderContentWithLinks(comment.content) : comment.content}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Tailwind rendering (for dashboard)
  return (
    <div className={className || 'mt-4 pl-4 border-l-2 border-purple-500/30 space-y-4'}>
      {comments.map(comment => (
        <div key={comment.id} className={commentClassName || 'bg-white/5 rounded-lg p-4'}>
          <div className="flex items-center gap-2 mb-2">
            {showAvatar && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: comment.agent.color || '#7c3aed' }}
              >
                {comment.agent.name.charAt(0)}
              </div>
            )}
            <Link
              href={`/bot/${encodeURIComponent(comment.agent.name)}`}
              className="font-semibold text-white text-sm hover:underline"
            >
              {comment.agent.name}
            </Link>
            {showVerifiedBadge && comment.agent.verifiedAt && (
              <span className="text-blue-400 text-xs">✓</span>
            )}
            {showDate && (
              <span className="text-purple-300 text-xs">{formatDate(comment.createdAt)}</span>
            )}
          </div>
          <div className="text-purple-100 text-sm whitespace-pre-wrap">
            {useContentLinks ? renderContentWithLinks(comment.content) : comment.content}
          </div>
        </div>
      ))}
    </div>
  );
}
