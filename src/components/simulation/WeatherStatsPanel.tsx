import React from 'react';
import { WeatherData, UiTheme } from '@/types/simulation';

interface WeatherStatsPanelProps {
    weather: WeatherData;
    uiTheme: UiTheme;
}

export const WeatherStatsPanel: React.FC<WeatherStatsPanelProps> = ({ weather, uiTheme }) => {
    if (!weather) return null;

    // Helper to get weather icon based on condition/code and day/night
    const getWeatherIcon = (weather: WeatherData) => {
        if (weather.isStormy) return '⛈️';
        if (weather.isSnowing) return '❄️';
        if (weather.isRaining) return '🌧️';
        if (weather.isFoggy) return '🌫️';
        if (weather.isCloudy) return '☁️';
        if (!weather.isDay) return '🌙';
        return '☀️';
    };

    const icon = getWeatherIcon(weather);

    // Helper for AQI color
    const getAqiColor = (aqi: number) => {
        if (aqi <= 50) return '#4caf50'; // Good
        if (aqi <= 100) return '#ffeb3b'; // Moderate
        if (aqi <= 150) return '#ff9800'; // Unhealthy for Sensitive Groups
        if (aqi <= 200) return '#f44336'; // Unhealthy
        if (aqi <= 300) return '#9c27b0'; // Very Unhealthy
        return '#795548'; // Hazardous
    };

    // Helper for AQI Label if not provided
    const getAqiLabel = (aqi: number) => {
        if (aqi <= 50) return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Sensitive';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
    };

    return (
        <div style={{
            position: 'relative',
            width: '240px',
            background: uiTheme.panelBg,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${uiTheme.borderColor}`,
            borderRadius: '16px',
            padding: '16px',
            color: uiTheme.textPrimary,
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${uiTheme.borderColor}`, paddingBottom: '12px' }}>
                <div style={{ fontSize: '42px', marginRight: '16px', lineHeight: 1 }}>{icon}</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: uiTheme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {weather.isDay ? 'Daytime' : 'Nighttime'}
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 800, lineHeight: 1, marginTop: '4px' }}>
                        {Math.round(weather.temperature)}°
                    </div>
                    <div style={{ fontSize: '13px', color: uiTheme.textSecondary, marginTop: '2px' }}>
                        Feels like {Math.round(weather.feelsLike)}°
                    </div>
                </div>
            </div>

            <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '-4px' }}>
                {weather.condition}
            </div>

            {/* Grid Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>

                {/* Humidity */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '10px', color: uiTheme.textSecondary, textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Humidity</div>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>{Math.round(weather.humidity)}%</div>
                </div>

                {/* Wind */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '10px', color: uiTheme.textSecondary, textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Wind</div>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>{weather.windSpeed.toFixed(1)} <span style={{ fontSize: '10px', color: uiTheme.textSecondary }}>km/h</span></div>
                </div>

                {/* Cloud Cover */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '10px', color: uiTheme.textSecondary, textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Clouds</div>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>{Math.round(weather.cloudCover)}%</div>
                </div>

                {/* AQI */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '10px', color: uiTheme.textSecondary, textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>AQI</div>
                    {weather.airQuality ? (
                        <div style={{ fontSize: '16px', fontWeight: 700, color: getAqiColor(weather.airQuality.us_aqi) }}>
                            {weather.airQuality.us_aqi}
                        </div>
                    ) : (
                        <div style={{ fontSize: '16px', color: uiTheme.textMuted }}>--</div>
                    )}
                </div>
            </div>

            {weather.airQuality && (
                <div style={{
                    fontSize: '11px',
                    marginTop: '4px',
                    padding: '8px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    color: uiTheme.textMuted,
                    lineHeight: 1.4
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Pollutants:</span>
                        <span style={{ color: getAqiColor(weather.airQuality.us_aqi), fontWeight: 600 }}>
                            {weather.airQuality.quality_label || getAqiLabel(weather.airQuality.us_aqi)}
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', textAlign: 'center' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px 0' }}>
                            <div style={{ fontSize: '9px', opacity: 0.7 }}>PM2.5</div>
                            <div style={{ fontWeight: 600, color: uiTheme.textSecondary }}>{weather.airQuality.pm2_5.toFixed(0)}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px 0' }}>
                            <div style={{ fontSize: '9px', opacity: 0.7 }}>PM10</div>
                            <div style={{ fontWeight: 600, color: uiTheme.textSecondary }}>{weather.airQuality.pm10.toFixed(0)}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px 0' }}>
                            <div style={{ fontSize: '9px', opacity: 0.7 }}>O₃</div>
                            <div style={{ fontWeight: 600, color: uiTheme.textSecondary }}>{weather.airQuality.ozone.toFixed(0)}</div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
