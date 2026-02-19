/**
 * Detailed panel showing all bot physical needs based on Maslow's hierarchy.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import type { UiTheme, SelectedBotInfo, BotNeeds } from '@/types/simulation';
import { NeedsMeterWithIcon, NeedsGridCard } from './NeedsMeter';
import { ensureContrastRatio } from '@/utils/color';

export interface PhysicalNeedsPanelProps {
  /** UI theme for day/night styling */
  uiTheme: UiTheme;
  /** Selected bot information */
  selectedBotInfo: SelectedBotInfo;
  /** Bot's physical needs data */
  needs: BotNeeds;
  /** Whether the air quality panel is visible (affects position) */
  showAirQuality: boolean;
  /** Whether air quality data is available */
  hasAirQuality: boolean;
  /** Callback to close the panel */
  onClose: () => void;
}

/**
 * Get status message based on need value and threshold
 */
function getStatusMessage(need: string, value: number): string {
  const messages: Record<string, { warning: string; ok: string; threshold: number }> = {
    water: { warning: '⚠️ Seeking water source', ok: 'Hydration level normal', threshold: 30 },
    food: { warning: '⚠️ Nutrition needed', ok: 'Energy level adequate', threshold: 25 },
    sleep: { warning: '⚠️ Rest required soon', ok: 'Rest level sufficient', threshold: 20 },
  };

  const config = messages[need];
  if (!config) return '';

  return value < config.threshold ? config.warning : config.ok;
}

/**
 * Get overall bot status based on needs and state
 */
function getBotStatus(state: string, needs: BotNeeds): string {
  if (state === 'seeking-water') return '🔍 Seeking Water';
  if (state === 'drinking') return '🚰 Drinking';
  if (needs.water < 30) return '⚠️ Thirsty';
  if (needs.food < 25) return '🍽️ Hungry';
  if (needs.sleep < 20) return '😴 Tired';
  return '✅ Healthy';
}

/**
 * Physical needs panel showing detailed Maslow's hierarchy needs for selected bot.
 * Positioned in upper right, shifts left when air quality panel is open.
 */
export function PhysicalNeedsPanel({
  uiTheme,
  selectedBotInfo,
  needs,
  showAirQuality,
  hasAirQuality,
  onClose,
}: PhysicalNeedsPanelProps) {
  const panelBgHex = uiTheme.panelBgHex || '#0d1117';
  const botColorAdjusted = ensureContrastRatio(selectedBotInfo.color, panelBgHex, 3.0);
  const botColorText = ensureContrastRatio(selectedBotInfo.color, panelBgHex, 4.5);

  return (
    <div
      style={{
        position: 'relative',
        width: '320px',
        background: uiTheme.panelBg,
        border: `1px solid ${uiTheme.borderColor}`,
        borderLeft: `5px solid ${botColorAdjusted}`,
        borderRadius: '12px',
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: 'blur(10px)',
        padding: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'background 0.5s, border-color 0.5s',
        maxHeight: 'calc(100vh - 130px)',
        overflowY: 'auto' as const,
      }}
    >
      {/* Header with Prominent Bot Name */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <div style={{
              color: botColorText,
              fontSize: '20px',
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: '4px',
              letterSpacing: '-0.5px'
            }}>
              {selectedBotInfo.botName}
            </div>
            <div style={{
              color: uiTheme.textSecondary,
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              opacity: 0.8
            }}>
              💧 Physical Needs
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              color: uiTheme.textSecondary,
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '14px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Overall Status & Critical Health Bar */}
      <div style={{
        background: 'rgba(74, 158, 255, 0.08)',
        padding: '16px',
        borderRadius: '12px',
        marginBottom: '20px',
        border: '1px solid rgba(74, 158, 255, 0.15)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '12px'
        }}>
          <div>
            <div style={{ fontSize: '10px', color: uiTheme.textSecondary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              Current Condition
            </div>
            <div style={{ fontSize: '18px', color: uiTheme.textPrimary, fontWeight: 800 }}>
              {getBotStatus(selectedBotInfo.state, needs)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: uiTheme.textSecondary, marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
              Homeostasis
            </div>
            <div style={{ fontSize: '18px', color: needs.homeostasis > 30 ? '#4caf50' : '#f44336', fontWeight: 800 }}>
              {Math.round(needs.homeostasis)}%
            </div>
          </div>
        </div>

        {/* Prominent Health Bar */}
        <div style={{
          width: '100%',
          height: '10px',
          background: 'rgba(0,0,0,0.4)',
          borderRadius: '5px',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
        }}>
          <div style={{
            width: `${needs.homeostasis}%`,
            height: '100%',
            background: needs.homeostasis > 60 ? 'linear-gradient(90deg, #4caf50, #81c784)' :
              needs.homeostasis > 30 ? 'linear-gradient(90deg, #ff9800, #ffb74d)' :
                'linear-gradient(90deg, #f44336, #e57373)',
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 15px rgba(255,255,255,0.1)'
          }} />
        </div>
      </div>

      {/* Primary Needs with Progress Bars */}
      <NeedsMeterWithIcon
        label="Water"
        value={needs.water}
        icon="💧"
        uiTheme={uiTheme}
        statusMessage={getStatusMessage('water', needs.water)}
      />

      <NeedsMeterWithIcon
        label="Food"
        value={needs.food}
        icon="🍽️"
        uiTheme={uiTheme}
        yellowThreshold={25}
        statusMessage={getStatusMessage('food', needs.food)}
      />

      <NeedsMeterWithIcon
        label="Sleep"
        value={needs.sleep}
        icon="😴"
        uiTheme={uiTheme}
        yellowThreshold={20}
        statusMessage={getStatusMessage('sleep', needs.sleep)}
      />

      <NeedsMeterWithIcon
        label="Social"
        value={needs.reproduction}
        icon="💞"
        uiTheme={uiTheme}
        yellowThreshold={20}
        statusMessage={needs.reproduction < 20 ? '⚠️ Seeking connection' : 'Social needs met'}
      />

      {/* Secondary Needs Grid */}
      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: `1px solid ${uiTheme.borderColor}`,
      }}>
        <div style={{ fontSize: '10px', color: uiTheme.textMuted, marginBottom: '12px', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>
          Secondary Needs
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <NeedsGridCard icon="🫁" label="Air" value={needs.air} uiTheme={uiTheme} />
          <NeedsGridCard icon="🏠" label="Shelter" value={needs.shelter} uiTheme={uiTheme} />
          <NeedsGridCard icon="👕" label="Clothing" value={needs.clothing} uiTheme={uiTheme} />
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            padding: '10px',
            borderRadius: '8px',
            border: `1px dashed ${uiTheme.borderColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: uiTheme.textSecondary,
            opacity: 0.5
          }}>
            Slot Empty
          </div>
        </div>
      </div>

      {/* Inventory Grid */}
      {selectedBotInfo.inventory && (
        <div style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: `1px solid ${uiTheme.borderColor}`,
        }}>
          <div style={{ fontSize: '10px', color: uiTheme.textMuted, marginBottom: '12px', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>
            Resources
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <NeedsGridCard icon="🪵" label="Wood" value={selectedBotInfo.inventory.wood} uiTheme={uiTheme} suffix="" />
            <NeedsGridCard icon="🪨" label="Stone" value={selectedBotInfo.inventory.stone} uiTheme={uiTheme} suffix="" />
            {selectedBotInfo.inventory.water !== undefined && (
              <NeedsGridCard icon="🍶" label="Water" value={selectedBotInfo.inventory.water} uiTheme={uiTheme} suffix="/5" />
            )}
            {selectedBotInfo.inventory.food !== undefined && (
              <NeedsGridCard icon="🍱" label="Food" value={selectedBotInfo.inventory.food} uiTheme={uiTheme} suffix="/3" />
            )}
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div style={{
        fontSize: '9px',
        color: uiTheme.textMuted,
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: `1px solid ${uiTheme.borderColor}`,
        textAlign: 'center' as const,
      }}>
        Physical needs based on Maslow&apos;s hierarchy • Real-time simulation
      </div>
    </div>
  );
}
