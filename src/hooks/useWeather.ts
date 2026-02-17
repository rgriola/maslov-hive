/**
 * useWeather hook — fetches weather + air quality data from Open-Meteo APIs.
 * Extracted from simulation/page.tsx to reduce component size.
 */

'use client';

import { useEffect, useState } from 'react';
import type { AirQualityData, WeatherData } from '@/types/simulation';

// WMO weather code sets
const RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const FOG_CODES = [45, 48];
const STORM_CODES = [82, 95, 96, 99];

const CONDITIONS: Record<number, string> = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
    96: 'Thunderstorm', 99: 'Severe thunderstorm',
};

function getAqiLabel(aqi: number): string {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
}

async function fetchAirQuality(lat: number, lng: number): Promise<AirQualityData | undefined> {
    try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
        const response = await fetch(url);
        if (!response.ok) return undefined;
        const data = await response.json();
        const aq = data.current;
        return {
            us_aqi: Math.round(aq.us_aqi || 0),
            european_aqi: Math.round(aq.european_aqi || 0),
            pm10: Math.round(aq.pm10 * 10) / 10,
            pm2_5: Math.round(aq.pm2_5 * 10) / 10,
            carbon_monoxide: Math.round(aq.carbon_monoxide || 0),
            nitrogen_dioxide: Math.round(aq.nitrogen_dioxide * 10) / 10,
            sulphur_dioxide: Math.round(aq.sulphur_dioxide * 10) / 10,
            ozone: Math.round(aq.ozone * 10) / 10,
            quality_label: getAqiLabel(Math.round(aq.us_aqi || 0)),
        };
    } catch (err) {
        console.error('Air quality fetch failed:', err);
        return undefined;
    }
}

async function fetchWeatherData(lat: number, lng: number): Promise<WeatherData | null> {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,cloud_cover,precipitation,relative_humidity_2m,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const current = data.current;

        const weatherCode = current.weather_code;
        const isRainCode = RAIN_CODES.includes(weatherCode);
        const isSnowCode = SNOW_CODES.includes(weatherCode);
        const isFogCode = FOG_CODES.includes(weatherCode);
        const isStormCode = STORM_CODES.includes(weatherCode);

        // Fetch air quality in parallel
        const airQuality = await fetchAirQuality(lat, lng);

        return {
            temperature: Math.round(current.temperature_2m),
            feelsLike: Math.round(current.apparent_temperature),
            condition: CONDITIONS[weatherCode] || 'Clear',
            weatherCode,
            cloudCover: current.cloud_cover,
            precipitation: current.precipitation,
            humidity: current.relative_humidity_2m,
            windSpeed: Math.round(current.wind_speed_10m),
            isDay: current.is_day === 1,
            isRaining: isRainCode || current.precipitation > 0,
            isSnowing: isSnowCode,
            isCloudy: current.cloud_cover > 50,
            isFoggy: isFogCode,
            isStormy: isStormCode,
            airQuality,
        };
    } catch (error) {
        console.error('Weather fetch failed:', error);
        return null;
    }
}

// ─── Hook ────────────────────────────────────────────────────────

interface UseWeatherOptions {
    location: { lat: number; lng: number } | null;
    /** Refresh interval in ms. Default: 10 minutes */
    refreshInterval?: number;
}

/**
 * Fetches weather + air quality data for a given location.
 * Falls back to NYC coordinates if no location is provided.
 */
export function useWeather({ location, refreshInterval = 10 * 60 * 1000 }: UseWeatherOptions) {
    const [weather, setWeather] = useState<WeatherData | null>(null);

    useEffect(() => {
        const lat = location?.lat ?? 40.7128;
        const lng = location?.lng ?? -74.006;

        fetchWeatherData(lat, lng).then(setWeather);
        const interval = setInterval(() => fetchWeatherData(lat, lng).then(setWeather), refreshInterval);
        return () => clearInterval(interval);
    }, [location, refreshInterval]);

    return weather;
}
