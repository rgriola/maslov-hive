/**
 * Detailed panel showing all bot physical needs based on Maslow's hierarchy.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import type { UiTheme, SelectedBotInfo, BotNeeds } from '@/types/simulation';
import { NeedsMeterWithIcon, NeedsGridCard } from './NeedsMeter';

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
  return (
    <div
      style={{
        position: 'absolute',
        top: '115px',
        right: showAirQuality && hasAirQuality ? '348px' : '8px',
        width: '320px',
        background: uiTheme.panelBg,
        border: `1px solid ${uiTheme.borderColor}`,
        borderRadius: '12px',
        zIndex: 15,
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: 'blur(10px)',
        padding: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'right 0.3s, background 0.5s, border-color 0.5s',
        maxHeight: 'calc(100vh - 130px)',
        overflowY: 'auto' as const,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: `1px solid ${uiTheme.borderColor}`,
      }}>
        <div>
          <div style={{ color: uiTheme.textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>
            💧 Physical Needs
          </div>
          <div style={{ color: uiTheme.textMuted, fontSize: '10px' }}>
            {selectedBotInfo.botName}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            color: uiTheme.textMuted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px',
            lineHeight: 1,
            transition: 'color 0.2s',
          }}
        >
          ✕
        </button>
      </div>

      {/* Overall Status */}
      <div style={{
        background: 'rgba(74, 158, 255, 0.1)',
        padding: '12px',
        borderRadius: '10px',
        marginBottom: '16px',
        border: '1px solid rgba(74, 158, 255, 0.2)',
      }}>
        <div style={{ fontSize: '10px', color: uiTheme.textMuted, marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>
          Bot Status
        </div>
        <div style={{ fontSize: '16px', color: uiTheme.textPrimary, fontWeight: 700 }}>
          {getBotStatus(selectedBotInfo.state, needs)}
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
          <NeedsGridCard icon="⚖️" label="Health" value={needs.homeostasis} uiTheme={uiTheme} />
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
