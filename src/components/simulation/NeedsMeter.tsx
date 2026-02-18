/**
 * Reusable progress bar meter for displaying bot physical needs.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import type { UiTheme } from '@/types/simulation';

// ─── Color Thresholds ───────────────────────────────────────────

/** Get status color based on value and thresholds */
function getStatusColor(value: number, greenThreshold = 60, yellowThreshold = 30): string {
  if (value >= greenThreshold) return '#4caf50';
  if (value >= yellowThreshold) return '#ff9800';
  return '#f44336';
}

/** Get gradient background based on value and thresholds */
function getGradientBackground(value: number, greenThreshold = 60, yellowThreshold = 30): string {
  if (value >= greenThreshold) return 'linear-gradient(90deg, #4caf50, #66bb6a)';
  if (value >= yellowThreshold) return 'linear-gradient(90deg, #ff9800, #ffa726)';
  return 'linear-gradient(90deg, #f44336, #ef5350)';
}

// ─── Types ──────────────────────────────────────────────────────

export interface NeedsMeterProps {
  /** Label text (e.g., "Water", "Food") */
  label: string;
  /** Current value (0-100) */
  value: number;
  /** UI theme for colors */
  uiTheme: UiTheme;
  /** Optional emoji icon */
  icon?: string;
  /** Bar height in pixels (default: 6) */
  barHeight?: number;
  /** Show icon inline with label (default: false) */
  showIcon?: boolean;
  /** Optional status message shown below bar */
  statusMessage?: string;
  /** Green threshold (default: 60) */
  greenThreshold?: number;
  /** Yellow/warning threshold (default: 30) */
  yellowThreshold?: number;
  /** Show glow effect on bar (default: false) */
  showGlow?: boolean;
  /** Font size for label (default: 11) */
  labelFontSize?: number;
  /** Font size for value (default: 11) */
  valueFontSize?: number;
}

/**
 * Compact needs meter without icon (used in Bot Metrics panel)
 */
export function NeedsMeter({
  label,
  value,
  uiTheme,
  barHeight = 6,
  greenThreshold = 60,
  yellowThreshold = 30,
  labelFontSize = 11,
  valueFontSize = 11,
}: NeedsMeterProps) {
  const statusColor = getStatusColor(value, greenThreshold, yellowThreshold);
  const gradientBg = getGradientBackground(value, greenThreshold, yellowThreshold);

  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px',
      }}>
        <span style={{ fontSize: `${labelFontSize}px`, color: uiTheme.textSecondary }}>
          {label}
        </span>
        <span style={{
          fontSize: `${valueFontSize}px`,
          fontWeight: 600,
          color: statusColor,
        }}>
          {Math.round(value)}%
        </span>
      </div>
      <div style={{
        width: '100%',
        height: `${barHeight}px`,
        background: 'rgba(0,0,0,0.3)',
        borderRadius: `${barHeight / 2}px`,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: gradientBg,
          transition: 'width 0.3s, background 0.3s',
        }} />
      </div>
    </div>
  );
}

export interface NeedsMeterWithIconProps extends NeedsMeterProps {
  /** Emoji icon (required for this variant) */
  icon: string;
}

/**
 * Full needs meter with icon and status message (used in Physical Needs panel)
 */
export function NeedsMeterWithIcon({
  label,
  value,
  uiTheme,
  icon,
  barHeight = 8,
  statusMessage,
  greenThreshold = 60,
  yellowThreshold = 30,
  showGlow = true,
  labelFontSize = 12,
  valueFontSize = 14,
}: NeedsMeterWithIconProps) {
  const statusColor = getStatusColor(value, greenThreshold, yellowThreshold);
  const gradientBg = getGradientBackground(value, greenThreshold, yellowThreshold);

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '16px' }}>{icon}</span>
          <span style={{ fontSize: `${labelFontSize}px`, color: uiTheme.textSecondary, fontWeight: 600 }}>
            {label}
          </span>
        </div>
        <span style={{
          fontSize: `${valueFontSize}px`,
          fontWeight: 700,
          color: statusColor,
        }}>
          {Math.round(value)}%
        </span>
      </div>
      <div style={{
        width: '100%',
        height: `${barHeight}px`,
        background: 'rgba(0,0,0,0.3)',
        borderRadius: `${barHeight / 2}px`,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: gradientBg,
          transition: 'width 0.3s, background 0.3s',
          boxShadow: showGlow ? '0 0 10px rgba(255,255,255,0.3)' : undefined,
        }} />
      </div>
      {statusMessage && (
        <div style={{ fontSize: '9px', color: uiTheme.textMuted, marginTop: '4px' }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}

export interface NeedsGridCardProps {
  /** Emoji icon */
  icon: string;
  /** Label text */
  label: string;
  /** Current value */
  value: number;
  /** UI theme for colors */
  uiTheme: UiTheme;
  /** Value suffix (default: "%") */
  suffix?: string;
}

/**
 * Compact grid card for secondary needs display
 */
export function NeedsGridCard({ icon, label, value, uiTheme, suffix = '%' }: NeedsGridCardProps) {
  return (
    <div style={{
      background: uiTheme.cardBg,
      padding: '10px',
      borderRadius: '8px',
      border: `1px solid ${uiTheme.borderColor}`,
    }}>
      <div style={{ fontSize: '20px', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: '10px', color: uiTheme.textMuted, marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '16px', color: uiTheme.textPrimary, fontWeight: 700 }}>
        {Math.round(value)}{suffix}
      </div>
    </div>
  );
}
