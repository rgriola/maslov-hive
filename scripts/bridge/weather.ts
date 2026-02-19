/**
 * Weather & Air Quality system — fetches real-world data for homeostasis modifiers.
 *
 * @module bridge/weather
 */

import { bridgeState, worldConfig } from './state';

/** Fetch current weather and AQI from Open-Meteo APIs */
export async function fetchWorldWeather() {
  try {
    const lat = process.env.BOT_LATITUDE || '40.71';
    const lon = process.env.BOT_LONGITUDE || '-74.01';

    // Fetch Temperature
    const tempUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const tempRes = await fetch(tempUrl);
    const tempData = await tempRes.json();
    bridgeState.currentTemperature = tempData.current_weather?.temperature ?? 20;

    // Fetch Air Quality (US AQI)
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`;
    const aqiRes = await fetch(aqiUrl);
    const aqiData = await aqiRes.json();
    bridgeState.currentAQI = aqiData.current?.us_aqi ?? 25;

    // Update world config for broadcast
    worldConfig.aqi = bridgeState.currentAQI;

    console.log(`🌡️  Weather Update: ${bridgeState.currentTemperature}°C, AQI: ${bridgeState.currentAQI}`);
  } catch (err) {
    console.error('⚠️ Failed to fetch weather data:', err);
  }
}

/** Get homeostasis decay multiplier based on temperature */
export function getTemperatureModifier(): number {
  const temp = bridgeState.currentTemperature;
  if (temp > 35 || temp < 0) return 3.0;
  if (temp > 30 || temp < 5) return 2.0;
  return 1.0;
}

/** Get homeostasis decay multiplier based on AQI */
export function getAQIModifier(): number {
  const aqi = bridgeState.currentAQI;
  if (aqi < 50) return 0.95;
  if (aqi > 150) return 1.05;
  return 1.0;
}
