/**
 * Floating panel displaying selected bot statistics and physical needs.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import type { UiTheme, SelectedBotInfo } from '@/types/simulation';
import { ensureContrastRatio } from '@/utils/color';
import { BOT_VISUALS } from '@/config/bot-visuals';
import { NeedsMeter } from './NeedsMeter';

export interface BotMetricsPanelProps {
  /** UI theme for day/night styling */
  uiTheme: UiTheme;
  /** Selected bot information */
  selectedBotInfo: SelectedBotInfo;
  /** Whether the activity feed is visible (affects panel position) */
  showFeed: boolean;
  /** Callback to close the panel */
  onClose: () => void;
}

/** Labels for physical needs display */
const NEED_LABELS: Record<string, string> = {
  food: 'Food',
  sleep: 'Sleep',
  air: 'Air',
  shelter: 'Shelter',
  clothing: 'Clothing',
  homeostasis: 'Health',
  reproduction: 'Social',
};

/**
 * Bot metrics panel showing identity, stats, and physical needs for selected bot.
 * Floats in upper left corner, adjusts position based on feed visibility.
 */
export function BotMetricsPanel({
  uiTheme,
  selectedBotInfo,
  showFeed,
  onClose,
}: BotMetricsPanelProps) {
  const botColorAdjusted = ensureContrastRatio(selectedBotInfo.color, uiTheme.panelBgHex, 3.0);
  const botColorText = ensureContrastRatio(selectedBotInfo.color, uiTheme.panelBgHex, 4.5);
  const botVisual = BOT_VISUALS[selectedBotInfo.personality] || BOT_VISUALS.tech;

  return (
    <div
      style={{
        position: 'absolute',
        top: '115px',
        left: showFeed ? '288px' : '8px',
        width: '240px',
        background: uiTheme.panelBg,
        border: `1px solid ${uiTheme.borderColor}`,
        borderRadius: '12px',
        zIndex: 15,
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: 'blur(10px)',
        padding: '14px 16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'left 0.3s, background 0.5s, border-color 0.5s',
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
          {botVisual.emoji}
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

      {/* Last Active */}
      {selectedBotInfo.lastPostTime && (
        <div style={{
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '8px',
          fontSize: '11px',
          color: uiTheme.textSecondary,
          marginBottom: '10px',
        }}>
          <span style={{ opacity: 0.7 }}>Last active:</span>{' '}
          <span style={{ color: uiTheme.textSecondary, fontWeight: 500 }}>{selectedBotInfo.lastPostTime}</span>
        </div>
      )}

      {/* Resources Inventory */}
      {selectedBotInfo.inventory && (
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
            🎒 Resources
          </div>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {/* Wood */}
            <div style={{
              flex: 1,
              background: 'rgba(139, 69, 19, 0.15)',
              padding: '10px 8px',
              borderRadius: '8px',
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>🪵</div>
              <div style={{ color: '#d4a574', fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>
                {selectedBotInfo.inventory.wood}
              </div>
              <div style={{ color: uiTheme.textSecondary, fontSize: '9px', textTransform: 'uppercase' as const }}>
                Wood
              </div>
            </div>
            
            {/* Stone */}
            <div style={{
              flex: 1,
              background: 'rgba(128, 128, 128, 0.15)',
              padding: '10px 8px',
              borderRadius: '8px',
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>🪨</div>
              <div style={{ color: '#a0a0a0', fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>
                {selectedBotInfo.inventory.stone}
              </div>
              <div style={{ color: uiTheme.textSecondary, fontSize: '9px', textTransform: 'uppercase' as const }}>
                Stone
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Physical Needs Meters */}
      {selectedBotInfo.needs && (
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
            💧 Physical Needs
          </div>
          
          {/* Water meter (always shown) */}
          <NeedsMeter
            label="Water"
            value={selectedBotInfo.needs.water}
            uiTheme={uiTheme}
          />
          
          {/* Other needs - only show if not 100% */}
          {Object.entries(selectedBotInfo.needs)
            .filter(([key]) => key !== 'water')
            .map(([key, value]) => {
              if (value >= 99) return null;
              return (
                <NeedsMeter
                  key={key}
                  label={NEED_LABELS[key] || key}
                  value={value}
                  uiTheme={uiTheme}
                />
              );
            })}
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
