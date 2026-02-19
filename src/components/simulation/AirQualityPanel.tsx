/**
 * Panel displaying detailed air quality index information.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import type { UiTheme, AirQualityData } from '@/types/simulation';
import { getAQIColor } from '@/utils/weather';

export interface AirQualityPanelProps {
  /** UI theme for day/night styling */
  uiTheme: UiTheme;
  /** Air quality data from weather API */
  airQuality: AirQualityData;
  /** Callback to close the panel */
  onClose: () => void;
}

/**
 * Air quality panel showing AQI values, particulate matter, and atmospheric gases.
 * Positioned in upper right corner of the simulation.
 */
export function AirQualityPanel({
  uiTheme,
  airQuality,
  onClose,
}: AirQualityPanelProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '330px',
        background: uiTheme.panelBg,
        border: `1px solid ${uiTheme.borderColor}`,
        borderRadius: '12px',
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: 'blur(10px)',
        padding: '16px 18px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'background 0.5s, border-color 0.5s',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '22px' }}>🫁</span>
          <span style={{ color: uiTheme.textSecondary, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
            Air Quality Index
          </span>
        </div>
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

      {/* AQI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
        {/* US AQI Card */}
        <div style={{
          background: `${getAQIColor(airQuality.us_aqi)}15`,
          padding: '14px',
          borderRadius: '10px',
          border: `2px solid ${getAQIColor(airQuality.us_aqi)}40`,
          textAlign: 'center' as const,
        }}>
          <div style={{
            color: getAQIColor(airQuality.us_aqi),
            fontSize: '28px',
            fontWeight: 700,
            marginBottom: '4px',
            textShadow: `0 0 10px ${getAQIColor(airQuality.us_aqi)}40`
          }}>
            {airQuality.us_aqi}
          </div>
          <div style={{ color: uiTheme.textSecondary, fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            US AQI
          </div>
          <div style={{
            color: getAQIColor(airQuality.us_aqi),
            fontSize: '9px',
            fontWeight: 600,
            marginTop: '6px',
            textTransform: 'uppercase' as const
          }}>
            {airQuality.quality_label}
          </div>
        </div>

        {/* European AQI Card */}
        <div style={{
          background: 'rgba(74, 158, 255, 0.1)',
          padding: '14px',
          borderRadius: '10px',
          border: '2px solid rgba(74, 158, 255, 0.3)',
          textAlign: 'center' as const,
        }}>
          <div style={{
            color: '#4a9eff',
            fontSize: '28px',
            fontWeight: 700,
            marginBottom: '4px',
            textShadow: '0 0 10px rgba(74, 158, 255, 0.4)'
          }}>
            {airQuality.european_aqi}
          </div>
          <div style={{ color: uiTheme.textSecondary, fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            European AQI
          </div>
          <div style={{
            color: uiTheme.textSecondary,
            fontSize: '9px',
            marginTop: '6px'
          }}>
            (0-100 scale)
          </div>
        </div>
      </div>

      {/* Particulate Matter */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{
          color: uiTheme.textSecondary,
          fontSize: '9px',
          textTransform: 'uppercase' as const,
          letterSpacing: '1px',
          marginBottom: '10px',
          fontWeight: 600
        }}>
          🪨 Particulate Matter
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${uiTheme.borderColor}`,
          }}>
            <div style={{ fontSize: '9px', color: uiTheme.textMuted, marginBottom: '4px' }}>PM2.5</div>
            <div style={{ fontSize: '16px', color: uiTheme.textPrimary, fontWeight: 600 }}>
              {airQuality.pm2_5} <span style={{ fontSize: '10px', color: uiTheme.textMuted }}>µg/m³</span>
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${uiTheme.borderColor}`,
          }}>
            <div style={{ fontSize: '9px', color: uiTheme.textMuted, marginBottom: '4px' }}>PM10</div>
            <div style={{ fontSize: '16px', color: uiTheme.textPrimary, fontWeight: 600 }}>
              {airQuality.pm10} <span style={{ fontSize: '10px', color: uiTheme.textMuted }}>µg/m³</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gases */}
      <div>
        <div style={{
          color: uiTheme.textSecondary,
          fontSize: '9px',
          textTransform: 'uppercase' as const,
          letterSpacing: '1px',
          marginBottom: '10px',
          fontWeight: 600
        }}>
          💨 Atmospheric Gases
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '8px 10px',
            borderRadius: '8px',
            border: `1px solid ${uiTheme.borderColor}`,
          }}>
            <div style={{ fontSize: '8px', color: uiTheme.textMuted, marginBottom: '2px' }}>Ozone (O₃)</div>
            <div style={{ fontSize: '14px', color: uiTheme.textPrimary, fontWeight: 600 }}>
              {airQuality.ozone} <span style={{ fontSize: '9px', color: uiTheme.textMuted }}>µg/m³</span>
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '8px 10px',
            borderRadius: '8px',
            border: `1px solid ${uiTheme.borderColor}`,
          }}>
            <div style={{ fontSize: '8px', color: uiTheme.textMuted, marginBottom: '2px' }}>NO₂</div>
            <div style={{ fontSize: '14px', color: uiTheme.textPrimary, fontWeight: 600 }}>
              {airQuality.nitrogen_dioxide} <span style={{ fontSize: '9px', color: uiTheme.textMuted }}>µg/m³</span>
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '8px 10px',
            borderRadius: '8px',
            border: `1px solid ${uiTheme.borderColor}`,
          }}>
            <div style={{ fontSize: '8px', color: uiTheme.textMuted, marginBottom: '2px' }}>SO₂</div>
            <div style={{ fontSize: '14px', color: uiTheme.textPrimary, fontWeight: 600 }}>
              {airQuality.sulphur_dioxide} <span style={{ fontSize: '9px', color: uiTheme.textMuted }}>µg/m³</span>
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '8px 10px',
            borderRadius: '8px',
            border: `1px solid ${uiTheme.borderColor}`,
          }}>
            <div style={{ fontSize: '8px', color: uiTheme.textMuted, marginBottom: '2px' }}>CO</div>
            <div style={{ fontSize: '14px', color: uiTheme.textPrimary, fontWeight: 600 }}>
              {airQuality.carbon_monoxide} <span style={{ fontSize: '9px', color: uiTheme.textMuted }}>µg/m³</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Footer */}
      <div style={{
        fontSize: '9px',
        color: uiTheme.textMuted,
        marginTop: '14px',
        paddingTop: '12px',
        borderTop: `1px solid ${uiTheme.borderColor}`,
        textAlign: 'center' as const,
      }}>
        Data from Open-Meteo Air Quality API • Updated every 10 min
      </div>
    </div>
  );
}
