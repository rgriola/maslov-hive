// Weather Module for Bot-Talker
// Uses Open-Meteo API (free, no API key required)

export interface AirQualityData {
  // Air Quality Indexes
  us_aqi: number;            // US AQI (0-500+)
  european_aqi: number;       // European AQI (0-100+)
  // Particulates
  pm10: number;              // PM10 µg/m³
  pm2_5: number;             // PM2.5 µg/m³
  // Gases
  carbon_monoxide: number;   // CO µg/m³
  nitrogen_dioxide: number;  // NO2 µg/m³
  sulphur_dioxide: number;   // SO2 µg/m³
  ozone: number;             // O3 µg/m³
  // Derived
  quality_label: string;     // 'Good', 'Moderate', etc.
}

export interface WeatherData {
  temperature: number;       // Fahrenheit
  feelsLike: number;         // Fahrenheit
  condition: string;         // Human-readable condition
  weatherCode: number;       // WMO weather code
  cloudCover: number;        // 0-100%
  precipitation: number;     // mm
  humidity: number;          // 0-100%
  windSpeed: number;         // mph
  isDay: boolean;
  // Derived visual flags
  isRaining: boolean;
  isSnowing: boolean;
  isCloudy: boolean;
  isFoggy: boolean;
  isStormy: boolean;
  // Air quality (optional)
  airQuality?: AirQualityData;
}

// WMO Weather interpretation codes
// https://open-meteo.com/en/docs
const WEATHER_CODES: Record<number, { condition: string; isRaining: boolean; isSnowing: boolean; isFoggy: boolean; isStormy: boolean }> = {
  0: { condition: 'Clear sky', isRaining: false, isSnowing: false, isFoggy: false, isStormy: false },
  1: { condition: 'Mainly clear', isRaining: false, isSnowing: false, isFoggy: false, isStormy: false },
  2: { condition: 'Partly cloudy', isRaining: false, isSnowing: false, isFoggy: false, isStormy: false },
  3: { condition: 'Overcast', isRaining: false, isSnowing: false, isFoggy: false, isStormy: false },
  45: { condition: 'Foggy', isRaining: false, isSnowing: false, isFoggy: true, isStormy: false },
  48: { condition: 'Depositing rime fog', isRaining: false, isSnowing: false, isFoggy: true, isStormy: false },
  51: { condition: 'Light drizzle', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  53: { condition: 'Moderate drizzle', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  55: { condition: 'Dense drizzle', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  56: { condition: 'Freezing drizzle', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  57: { condition: 'Dense freezing drizzle', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  61: { condition: 'Slight rain', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  63: { condition: 'Moderate rain', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  65: { condition: 'Heavy rain', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  66: { condition: 'Freezing rain', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  67: { condition: 'Heavy freezing rain', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  71: { condition: 'Slight snow', isRaining: false, isSnowing: true, isFoggy: false, isStormy: false },
  73: { condition: 'Moderate snow', isRaining: false, isSnowing: true, isFoggy: false, isStormy: false },
  75: { condition: 'Heavy snow', isRaining: false, isSnowing: true, isFoggy: false, isStormy: false },
  77: { condition: 'Snow grains', isRaining: false, isSnowing: true, isFoggy: false, isStormy: false },
  80: { condition: 'Slight rain showers', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  81: { condition: 'Moderate rain showers', isRaining: true, isSnowing: false, isFoggy: false, isStormy: false },
  82: { condition: 'Violent rain showers', isRaining: true, isSnowing: false, isFoggy: false, isStormy: true },
  85: { condition: 'Slight snow showers', isRaining: false, isSnowing: true, isFoggy: false, isStormy: false },
  86: { condition: 'Heavy snow showers', isRaining: false, isSnowing: true, isFoggy: false, isStormy: false },
  95: { condition: 'Thunderstorm', isRaining: true, isSnowing: false, isFoggy: false, isStormy: true },
  96: { condition: 'Thunderstorm with hail', isRaining: true, isSnowing: false, isFoggy: false, isStormy: true },
  99: { condition: 'Thunderstorm with heavy hail', isRaining: true, isSnowing: false, isFoggy: false, isStormy: true },
};

/**
 * Fetch current weather from Open-Meteo API
 */
export async function getWeather(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,cloud_cover,precipitation,relative_humidity_2m,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Weather API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const current = data.current;
    
    const weatherCode = current.weather_code;
    const codeInfo = WEATHER_CODES[weatherCode] || WEATHER_CODES[0];
    
    return {
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      condition: codeInfo.condition,
      weatherCode,
      cloudCover: current.cloud_cover,
      precipitation: current.precipitation,
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      isDay: current.is_day === 1,
      isRaining: codeInfo.isRaining || current.precipitation > 0,
      isSnowing: codeInfo.isSnowing,
      isCloudy: current.cloud_cover > 50,
      isFoggy: codeInfo.isFoggy,
      isStormy: codeInfo.isStormy,
    };
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    return null;
  }
}

/**
 * Get weather emoji based on conditions
 */
export function getWeatherEmoji(weather: WeatherData): string {
  if (weather.isStormy) return '⛈️';
  if (weather.isSnowing) return '🌨️';
  if (weather.isRaining) return '🌧️';
  if (weather.isFoggy) return '🌫️';
  if (!weather.isDay) {
    return weather.isCloudy ? '☁️' : '🌙';
  }
  if (weather.cloudCover > 80) return '☁️';
  if (weather.cloudCover > 40) return '⛅';
  return '☀️';
}

/**
 * Fetch air quality data from Open-Meteo Air Quality API
 */
export async function getAirQuality(lat: number, lng: number): Promise<AirQualityData | null> {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Air Quality API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const current = data.current;
    
    // Determine quality label based on US AQI
    let quality_label = 'Unknown';
    const aqi = current.us_aqi;
    if (aqi <= 50) quality_label = 'Good';
    else if (aqi <= 100) quality_label = 'Moderate';
    else if (aqi <= 150) quality_label = 'Unhealthy for Sensitive Groups';
    else if (aqi <= 200) quality_label = 'Unhealthy';
    else if (aqi <= 300) quality_label = 'Very Unhealthy';
    else quality_label = 'Hazardous';
    
    return {
      us_aqi: Math.round(current.us_aqi || 0),
      european_aqi: Math.round(current.european_aqi || 0),
      pm10: Math.round(current.pm10 * 10) / 10,
      pm2_5: Math.round(current.pm2_5 * 10) / 10,
      carbon_monoxide: Math.round(current.carbon_monoxide || 0),
      nitrogen_dioxide: Math.round(current.nitrogen_dioxide * 10) / 10,
      sulphur_dioxide: Math.round(current.sulphur_dioxide * 10) / 10,
      ozone: Math.round(current.ozone * 10) / 10,
      quality_label,
    };
  } catch (error) {
    console.error('Failed to fetch air quality:', error);
    return null;
  }
}

/**
 * Get AQI color for UI display
 */
export function getAQIColor(aqi: number): string {
  if (aqi <= 50) return '#00e400';      // Green
  if (aqi <= 100) return '#ffff00';     // Yellow
  if (aqi <= 150) return '#ff7e00';     // Orange
  if (aqi <= 200) return '#ff0000';     // Red
  if (aqi <= 300) return '#8f3f97';     // Purple
  return '#7e0023';                      // Maroon
}

/**
 * Format weather for bot context
 */
export function formatWeatherForPrompt(weather: WeatherData, locationName?: string): string {
  const location = locationName || 'the local area';
  let context = `Current weather in ${location}: ${weather.temperature}°F (feels like ${weather.feelsLike}°F), ${weather.condition}. Cloud cover: ${weather.cloudCover}%, Humidity: ${weather.humidity}%, Wind: ${weather.windSpeed} mph.`;
  
  if (weather.airQuality) {
    context += ` Air quality: ${weather.airQuality.quality_label} (AQI ${weather.airQuality.us_aqi}).`;
  }
  
  return context;
}
