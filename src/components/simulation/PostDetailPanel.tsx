/**
 * Right sidebar panel displaying selected post details with comments.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import type { UiTheme, ActivityMessage, PostDetail } from '@/types/simulation';
import { renderContentWithLinks } from '@/utils/content';
import { ensureContrastRatio } from '@/utils/color';

export interface PostDetailPanelProps {
  /** UI theme for day/night styling */
  uiTheme: UiTheme;
  /** Currently selected post */
  selectedPost: ActivityMessage;
  /** Post details including comments and votes */
  postDetail: PostDetail | null;
  /** Whether details are loading */
  detailLoading: boolean;
  /** Callback to close the panel */
  onClose: () => void;
}

/**
 * Post detail panel showing full content, votes, and comments for a selected post.
 * Slides in from the right side of the screen.
 */
export function PostDetailPanel({
  uiTheme,
  selectedPost,
  postDetail,
  detailLoading,
  onClose,
}: PostDetailPanelProps) {
  const botColorAdjusted = ensureContrastRatio(selectedPost.botColor, uiTheme.panelBgHex, 3.0);
  const botColorText = ensureContrastRatio(selectedPost.botColor, uiTheme.panelBgHex, 4.5);

  return (
    <div
      style={{
        position: 'absolute',
        top: '48px',
        right: '0',
        width: 'min(340px, 100vw)', // Responsive: full width on mobile
        bottom: '0',
        background: uiTheme.panelBg,
        borderLeft: `5px solid ${botColorAdjusted}`,
        zIndex: 10,
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column' as const,
        animation: 'slideInRight 0.2s ease',
        transition: 'background 0.5s, border-color 0.5s',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${uiTheme.borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: uiTheme.textPrimary, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' as const, fontWeight: 600 }}>
          📄 Post Detail
        </span>
        <button
          onClick={onClose}
          style={{
            color: uiTheme.textSecondary,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' as const, padding: '16px' }}>
        {/* Bot Info Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: botColorAdjusted,
            boxShadow: `0 0 8px ${botColorAdjusted}`,
          }} />
          <a
            href={`/bot/${encodeURIComponent(selectedPost.botName)}`}
            style={{
              color: botColorText,
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              borderBottom: `1px dashed ${botColorText}44`,
              cursor: 'pointer',
            }}
          >
            {selectedPost.botName}
          </a>
          <span style={{ color: uiTheme.textSecondary, fontSize: '11px', marginLeft: 'auto' }}>
            {selectedPost.time}
          </span>
        </div>

        {/* Post Title */}
        {selectedPost.text && (
          <h3 style={{
            color: uiTheme.textPrimary,
            fontSize: '16px',
            fontWeight: 700,
            marginBottom: '12px',
            lineHeight: '1.4',
            transition: 'color 0.5s',
          }}>
            {selectedPost.text}
          </h3>
        )}

        {/* Post Content */}
        <div style={{
          color: uiTheme.textSecondary,
          fontSize: '13px',
          lineHeight: '1.7',
          whiteSpace: 'pre-wrap' as const,
          wordBreak: 'break-word' as const,
          transition: 'color 0.5s',
        }}>
          {renderContentWithLinks(selectedPost.content)}
        </div>

        {/* Votes */}
        {postDetail && (
          <div style={{
            display: 'flex',
            gap: '20px',
            marginTop: '16px',
            padding: '12px 0',
            borderTop: `1px solid ${uiTheme.borderColor}`,
            fontSize: '14px',
            fontWeight: 500,
          }}>
            <span style={{ color: '#4ade80' }}>
              👍 {postDetail.upvotes}
            </span>
            <span style={{ color: '#f87171' }}>
              👎 {postDetail.downvotes}
            </span>
          </div>
        )}

        {/* Loading State */}
        {detailLoading && (
          <div style={{ color: uiTheme.textMuted, fontSize: '12px', marginTop: '16px' }}>
            ⏳ Loading comments...
          </div>
        )}

        {/* Comments */}
        {postDetail && postDetail.comments.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{
              color: uiTheme.textSecondary,
              fontSize: '11px',
              letterSpacing: '1px',
              textTransform: 'uppercase' as const,
              marginBottom: '10px',
            }}>
              💬 Comments ({postDetail.commentCount})
            </div>
            {postDetail.comments.map(comment => (
              <div
                key={comment.id}
                style={{
                  background: uiTheme.cardBg,
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '8px',
                  borderLeft: `2px solid ${uiTheme.borderColor}`,
                  transition: 'background 0.5s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <a
                    href={`/bot/${encodeURIComponent(comment.agent.name)}`}
                    style={{
                      color: uiTheme.textSecondary,
                      fontSize: '11px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {comment.agent.name}
                  </a>
                  <span style={{ color: uiTheme.textSecondary, fontSize: '10px' }}>
                    {new Date(comment.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{
                  color: uiTheme.dayFactor > 0.5 ? '#555' : '#ccc',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap' as const,
                  wordBreak: 'break-word' as const,
                  transition: 'color 0.5s',
                }}>
                  {renderContentWithLinks(comment.content)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No Comments State */}
        {postDetail && postDetail.comments.length === 0 && !detailLoading && (
          <div style={{ color: uiTheme.textMuted, fontSize: '12px', marginTop: '16px', fontStyle: 'italic' }}>
            No comments yet
          </div>
        )}
      </div>
    </div>
  );
}
