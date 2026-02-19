/**
 * Floating panel displaying selected bot statistics and physical needs.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import type { UiTheme, SelectedBotInfo } from '@/types/simulation';
import { ensureContrastRatio } from '@/utils/color';
import { getPersonalityMeta } from '@/config/bot-visuals';

export interface BotMetricsPanelProps {
  /** UI theme for day/night styling */
  uiTheme: UiTheme;
  /** Selected bot information */
  selectedBotInfo: SelectedBotInfo;
  /** Whether the activity feed is visible (affects panel position) */
  showFeed: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Whether physical needs are visible */
  showPhysicalNeeds: boolean;
  /** Callback to toggle physical needs */
  onToggleNeeds: () => void;
}

/**
 * Bot metrics panel showing identity, stats, and physical needs for selected bot.
 * Floats in upper left corner, adjusts position based on feed visibility.
 */
export function BotMetricsPanel({
  uiTheme,
  selectedBotInfo,
  showFeed,
  onClose,
  showPhysicalNeeds,
  onToggleNeeds,
}: BotMetricsPanelProps) {
  const botColorAdjusted = ensureContrastRatio(selectedBotInfo.color, uiTheme.panelBgHex, 3.0);
  const botColorText = ensureContrastRatio(selectedBotInfo.color, uiTheme.panelBgHex, 4.5);
  const meta = getPersonalityMeta(selectedBotInfo.personality);

  return (
    <div
      style={{
        position: 'absolute',
        top: '115px',
        left: showFeed ? '288px' : '8px',
        width: 'min(240px, calc(100vw - 24px))', // Responsive
        background: uiTheme.panelBg,
        border: `1px solid ${uiTheme.borderColor}`,
        borderRadius: '12px',
        zIndex: 15,
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: 'blur(10px)',
        padding: '14px 16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'left 0.3s, background 0.5s, border-color 0.5s',
        maxHeight: 'calc(100vh - 130px)',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '14px',
        paddingBottom: '10px',
        borderBottom: `1px solid ${uiTheme.borderColor}`,
      }}>
        <span style={{ color: uiTheme.textSecondary, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
          📊 Bot Metrics
        </span>
        <button
          onClick={onClose}
          style={{
            color: uiTheme.textMuted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Bot Identity */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '10px',
        borderLeft: `5px solid ${botColorAdjusted}`,
      }}>
        <span style={{ fontSize: '28px', lineHeight: 1 }}>
          {meta.emoji}
        </span>
        <div>
          <div style={{ color: botColorText, fontWeight: 600, fontSize: '15px', marginBottom: '2px' }}>
            {selectedBotInfo.botName}
          </div>
          <div style={{ color: uiTheme.textSecondary, fontSize: '11px', textTransform: 'capitalize' as const }}>
            {selectedBotInfo.personality}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={onToggleNeeds}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: showPhysicalNeeds ? 'rgba(74, 158, 255, 0.2)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${showPhysicalNeeds ? 'rgba(74, 158, 255, 0.4)' : uiTheme.borderColor}`,
            borderRadius: '8px',
            color: showPhysicalNeeds ? '#4a9eff' : uiTheme.textPrimary,
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <span>{showPhysicalNeeds ? '📖' : '📕'}</span>
          {showPhysicalNeeds ? 'Hide Physical Needs' : 'Show Physical Needs'}
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
        <div style={{
          background: 'rgba(74, 158, 255, 0.1)',
          padding: '10px 8px',
          borderRadius: '8px',
          textAlign: 'center' as const,
        }}>
          <div style={{ color: '#4a9eff', fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>
            {selectedBotInfo.postCount}
          </div>
          <div style={{ color: uiTheme.textSecondary, fontSize: '9px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            Posts
          </div>
        </div>
        <div style={{
          background: 'rgba(255, 152, 0, 0.1)',
          padding: '10px 8px',
          borderRadius: '8px',
          textAlign: 'center' as const,
        }}>
          <div style={{ color: '#ff9800', fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
            {selectedBotInfo.height ? `${selectedBotInfo.height.toFixed(2)}m` : '—'}
          </div>
          <div style={{ color: uiTheme.textSecondary, fontSize: '9px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            Height
          </div>
        </div>
        <div style={{
          background: 'rgba(76, 175, 80, 0.1)',
          padding: '10px 8px',
          borderRadius: '8px',
          textAlign: 'center' as const,
        }}>
          <div style={{
            color: selectedBotInfo.state === 'posting' ? '#fbbf24' : '#4caf50',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'capitalize' as const,
            marginBottom: '4px',
          }}>
            {selectedBotInfo.state || 'idle'}
          </div>
          <div style={{ color: uiTheme.textSecondary, fontSize: '9px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            Status
          </div>
        </div>
      </div>

      {/* Lifetime Metrics Section */}
      {selectedBotInfo.lifetimeStats && (
        <div style={{
          padding: '12px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '10px',
          marginBottom: '12px',
          border: `1px solid ${uiTheme.borderColor}`,
        }}>
          <div style={{
            color: uiTheme.textSecondary,
            fontSize: '10px',
            letterSpacing: '1px',
            textTransform: 'uppercase' as const,
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            📜 Lifetime Metrics
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <MetricItem label="Wood Gathered" value={selectedBotInfo.lifetimeStats.totalWood} emoji="🌲" uiTheme={uiTheme} />
            <MetricItem label="Stone Mined" value={selectedBotInfo.lifetimeStats.totalStone} emoji="🪨" uiTheme={uiTheme} />
            <MetricItem label="Water Drank" value={selectedBotInfo.lifetimeStats.totalWater} emoji="💧" uiTheme={uiTheme} />
            <MetricItem label="Food Eaten" value={selectedBotInfo.lifetimeStats.totalFood} emoji="🍎" uiTheme={uiTheme} />
            <MetricItem label="Reproduction" value={selectedBotInfo.lifetimeStats.reproductionCount} emoji="💝" uiTheme={uiTheme} />
            <MetricItem label="Children" value={selectedBotInfo.lifetimeStats.childrenCount} emoji="👶" uiTheme={uiTheme} />
            <MetricItem label="Shelters Built" value={selectedBotInfo.lifetimeStats.sheltersBuilt} emoji="🛖" uiTheme={uiTheme} />
            <MetricItem label="Total Help" value={selectedBotInfo.lifetimeStats.helpCount} emoji="🦸" uiTheme={uiTheme} />
          </div>
        </div>
      )}

      {/* Persistence Awareness — nearby bots */}
      {selectedBotInfo.awareness && selectedBotInfo.awareness.length > 0 && (
        <div style={{
          padding: '12px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '10px',
          marginBottom: '12px',
        }}>
          <div style={{
            color: uiTheme.textSecondary,
            fontSize: '10px',
            letterSpacing: '1px',
            textTransform: 'uppercase' as const,
            marginBottom: '10px',
          }}>
            👁️ Awareness ({selectedBotInfo.awareness.length})
          </div>

          {selectedBotInfo.awareness.map((nearby) => (
            <div
              key={nearby.botId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '6px',
                marginBottom: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>
                  {nearby.urgentNeed || '✅'}
                </span>
                <span style={{
                  color: uiTheme.textPrimary,
                  fontSize: '12px',
                  fontWeight: 500,
                }}>
                  {nearby.botName}
                </span>
              </div>
              <span style={{
                color: uiTheme.textMuted,
                fontSize: '10px',
                fontFamily: 'monospace',
              }}>
                {nearby.distance}m
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bot ID */}
      <div style={{
        fontSize: '10px',
        color: uiTheme.textMuted,
        fontFamily: 'monospace',
        opacity: 0.5,
        paddingTop: '6px',
        borderTop: `1px solid ${uiTheme.borderColor}`,
      }}>
        ID: {selectedBotInfo.botId.substring(0, 12)}...
      </div>
    </div>
  );
}

function MetricItem({ label, value, emoji, uiTheme }: { label: string, value: number, emoji: string, uiTheme: UiTheme }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '6px 8px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
        <span style={{ fontSize: '10px' }}>{emoji}</span>
        <span style={{ color: uiTheme.textMuted, fontSize: '9px', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ color: uiTheme.textPrimary, fontSize: '12px', fontWeight: 700 }}>
        {value || 0}
      </div>
    </div>
  );
}
