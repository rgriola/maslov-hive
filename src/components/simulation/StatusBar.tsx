/**
 * Top status bar showing time, location, weather, and bot needs.
 * Refactored: 2026-02-16 @ extraction from page.tsx
 */

import { RefObject } from 'react';
import type { WeatherData, SelectedBotInfo } from '@/types/simulation';
import { getWeatherEmoji, getAQIColor } from '@/utils/weather';

export interface StatusBarProps {
  /** Current time (null during SSR) */
  currentTime: Date | null;
  /** User's GPS location */
  location: { lat: number; lng: number } | null;
  /** Current weather data */
  weather: WeatherData | null;
  /** Selected bot info (for physical needs button) */
  selectedBotInfo: SelectedBotInfo | null;
  /** Whether air quality panel is shown */
  showAirQuality: boolean;
  /** Callback to toggle air quality panel */
  setShowAirQuality: (show: boolean) => void;
  /** Whether weather panel is shown */
  showWeather: boolean;
  /** Callback to toggle weather panel */
  setShowWeather: (show: boolean) => void;
  /** Whether all bots panel is shown */
  showAllBots: boolean;
  /** Callback to toggle all bots panel */
  setShowAllBots: (show: boolean) => void;
  /** Ref for connection status element */
  statusRef: RefObject<HTMLDivElement | null>;
  /** Callback to reset camera view */
  onReset: () => void;
  /** Simulation speed (1, 2, 4) */
  simSpeed: number;
  /** Callback to change simulation speed */
  onSetSpeed: (speed: number) => void;
  /** Callback for full world reset */
  onFullReset: () => void;
}

/**
 * Status bar component with time, weather, AQI, and navigation controls.
 * Fixed to top of simulation viewport.
 */
export function StatusBar({
  currentTime,
  location,
  weather,
  selectedBotInfo,
  showAirQuality,
  setShowAirQuality,
  showWeather,
  setShowWeather,
  showAllBots,
  setShowAllBots,
  statusRef,
  onReset,
  simSpeed,
  onSetSpeed,
  onFullReset,
}: StatusBarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '48px',
        background: 'linear-gradient(180deg, rgba(10,10,26,0.95), rgba(10,10,26,0.6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 10,
        borderBottom: '1px solid rgba(74, 158, 255, 0.15)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '20px' }}>🌍</span>
        <span style={{ color: '#e0e0ff', fontWeight: 600, fontSize: '15px', letterSpacing: '0.5px' }}>
          Maslov Hive
        </span>
      </div>

      {/* Right: Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Date/Time */}
        <div style={{ fontSize: '12px', color: '#a0a0c0', fontFamily: 'monospace', textAlign: 'right' }}>
          <div>{currentTime?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) ?? '—'}</div>
          <div>{currentTime?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? '—'}</div>
        </div>

        {/* Location */}
        {location && (
          <div style={{ fontSize: '11px', color: '#7a7a9a', fontFamily: 'monospace' }}>
            📍 {location.lat.toFixed(3)}, {location.lng.toFixed(3)}
          </div>
        )}

        {/* Weather (Clickable) */}
        {weather && (
          <button
            onClick={() => setShowWeather(!showWeather)}
            style={{
              fontSize: '12px',
              color: '#e0e0ff',
              fontFamily: 'system-ui',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: showWeather ? 'rgba(74, 158, 255, 0.2)' : 'rgba(74, 158, 255, 0.05)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: `1px solid ${showWeather ? 'rgba(74, 158, 255, 0.4)' : 'rgba(74, 158, 255, 0.15)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '18px' }}>{getWeatherEmoji(weather)}</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>{weather.temperature}°F</div>
              <div style={{ fontSize: '10px', color: '#a0a0c0' }}>{weather.condition}</div>
            </div>
          </button>
        )}

        {/* All Bots Toggle */}
        <button
          onClick={() => setShowAllBots(!showAllBots)}
          style={{
            fontSize: '12px',
            color: '#e0e0ff',
            fontFamily: 'system-ui',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: showAllBots ? 'rgba(74, 158, 255, 0.2)' : 'rgba(74, 158, 255, 0.05)',
            padding: '4px 10px',
            borderRadius: '6px',
            border: `1px solid ${showAllBots ? 'rgba(74, 158, 255, 0.4)' : 'rgba(74, 158, 255, 0.15)'}`,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <span style={{ fontSize: '16px' }}>👥</span>
          <span style={{ fontWeight: 600 }}>Bots</span>
        </button>

        {/* Air Quality Button */}
        {weather?.airQuality && (
          <button
            onClick={() => setShowAirQuality(!showAirQuality)}
            style={{
              fontSize: '12px',
              color: '#e0e0ff',
              fontFamily: 'system-ui',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: showAirQuality ? 'rgba(74, 158, 255, 0.2)' : 'rgba(74, 158, 255, 0.1)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: `1px solid ${showAirQuality ? 'rgba(74, 158, 255, 0.4)' : 'rgba(74, 158, 255, 0.2)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '16px' }}>🫁</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontWeight: 600,
                color: getAQIColor(weather.airQuality.us_aqi)
              }}>
                AQI {weather.airQuality.us_aqi}
              </div>
              <div style={{ fontSize: '10px', color: '#a0a0c0' }}>{weather.airQuality.quality_label}</div>
            </div>
          </button>
        )}

        {/* Connection Status */}
        <div
          ref={statusRef}
          style={{ fontSize: '12px', color: '#fbbf24', transition: 'color 0.3s', fontWeight: 600, minWidth: '80px' }}
        >
          ⏳ Connecting...
        </div>

        {/* Speed Controls */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '2px',
          border: '1px solid rgba(74, 158, 255, 0.2)'
        }}>
          {[1, 2, 4].map(s => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: simSpeed === s ? '#fff' : '#888',
                background: simSpeed === s ? 'rgba(74, 158, 255, 0.4)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title={`Press 'Q' to toggle speed`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Full Reset Button (Temporary) */}
        <button
          onClick={onFullReset}
          style={{
            color: '#ff4d4d',
            fontSize: '12px',
            fontWeight: 600,
            background: 'rgba(255, 77, 77, 0.1)',
            padding: '6px 14px',
            border: '1px solid rgba(255, 77, 77, 0.3)',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 77, 77, 0.25)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)')}
        >
          <span>🚨</span> Full Reset
        </button>

        {/* Dashboard Link */}
        <a
          href="/dashboard"
          style={{
            color: '#8888cc',
            fontSize: '13px',
            textDecoration: 'none',
            padding: '4px 12px',
            border: '1px solid rgba(136,136,204,0.3)',
            borderRadius: '6px',
          }}
        >
          Dashboard →
        </a>

        {/* Reset View Button */}
        <button
          onClick={onReset}
          style={{
            color: '#e0e0ff',
            fontSize: '13px',
            background: 'rgba(74, 158, 255, 0.15)',
            padding: '4px 12px',
            border: '1px solid rgba(74, 158, 255, 0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          ↺ Reset View
        </button>
      </div>
    </div>
  );
}
