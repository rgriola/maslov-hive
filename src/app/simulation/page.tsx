/**
 * 3D simulation page with bot visualization and real-time WebSocket updates.
 * Refactored: 2026-02-16 @ modularization into components and utilities
 */

'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Types
import type {
  AirQualityData,
  WeatherData,
  BotData,
  BotEntity,
  ActivityMessage,
  SelectedBotInfo,
  PostDetail,
} from '@/types/simulation';

// Utilities
import { rgbToHex } from '@/utils/color';
import { calculateSunPosition } from '@/utils/solar';

// Config
import { BOT_VISUALS } from '@/config/bot-visuals';

// Components
import {
  StatusBar,
  ActivityFeedPanel,
  PostDetailPanel,
  BotMetricsPanel,
  AirQualityPanel,
  PhysicalNeedsPanel,
} from '@/components/simulation';

export default function SimulationPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const botsRef = useRef<Map<string, BotEntity>>(new Map());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  // Lighting refs for dynamic sun/moon
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const moonLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  // Raycaster for click detection
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const [activityFeed, setActivityFeed] = useState<ActivityMessage[]>([]);
  const activityRef = useRef(setActivityFeed);  // ref relay for useEffect
  const feedRef = useRef<HTMLDivElement>(null);
  const [showFeed, setShowFeed] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ActivityMessage | null>(null);
  const [postDetail, setPostDetail] = useState<PostDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedBotInfo, setSelectedBotInfo] = useState<SelectedBotInfo | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null); // null until client mount
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [showAirQuality, setShowAirQuality] = useState(false);
  const [showPhysicalNeeds, setShowPhysicalNeeds] = useState(false);
  // Particle system refs for weather effects
  const rainParticlesRef = useRef<THREE.Points | null>(null);
  const cloudParticlesRef = useRef<THREE.Points | null>(null);
  // Water and food spots for bot survival needs
  const waterSpotsRef = useRef<THREE.Mesh[]>([]);
  const foodSpotsRef = useRef<THREE.Object3D[]>([]); // Groups of corn stalks
  const cornTargetScaleRef = useRef<number>(1); // Target scale for corn (0-1)
  const cornInitializedRef = useRef<boolean>(false); // Track if corn field was created
  // Resource spots for building
  const woodSpotsRef = useRef<THREE.Object3D[]>([]); // Forest trees
  const stoneSpotsRef = useRef<THREE.Object3D[]>([]); // Quarry rocks
  const sheltersRef = useRef<Map<string, THREE.Object3D>>(new Map()); // Bot shelters
  const sundialRef = useRef<THREE.Object3D | null>(null); // Community sundial
  const woodInitializedRef = useRef<boolean>(false);
  const stoneInitializedRef = useRef<boolean>(false);
  const sundialInitializedRef = useRef<boolean>(false);

  // ─── Clock & Location ────────────────────────────────────────
  useEffect(() => {
    // Initialize time on client mount to avoid hydration mismatch
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Get GPS location
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setLocation(null),
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  // ─── Fetch Weather Data ────────────────────────────────────
  useEffect(() => {
    const fetchWeather = async (lat: number, lng: number) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,cloud_cover,precipitation,relative_humidity_2m,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm`;
        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.json();
        const current = data.current;
        
        // WMO weather code interpretation
        const weatherCode = current.weather_code;
        const isRainCode = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(weatherCode);
        const isSnowCode = [71,73,75,77,85,86].includes(weatherCode);
        const isFogCode = [45,48].includes(weatherCode);
        const isStormCode = [82,95,96,99].includes(weatherCode);
        
        const conditions: Record<number, string> = {
          0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
          45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle',
          55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
          71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
          80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers',
          85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
          96: 'Thunderstorm', 99: 'Severe thunderstorm'
        };
        
        // Fetch air quality in parallel
        let airQuality: AirQualityData | undefined;
        try {
          const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
          const aqResponse = await fetch(aqUrl);
          if (aqResponse.ok) {
            const aqData = await aqResponse.json();
            const aq = aqData.current;
            const aqi = aq.us_aqi;
            let quality_label = 'Unknown';
            if (aqi <= 50) quality_label = 'Good';
            else if (aqi <= 100) quality_label = 'Moderate';
            else if (aqi <= 150) quality_label = 'Unhealthy for Sensitive Groups';
            else if (aqi <= 200) quality_label = 'Unhealthy';
            else if (aqi <= 300) quality_label = 'Very Unhealthy';
            else quality_label = 'Hazardous';
            
            airQuality = {
              us_aqi: Math.round(aq.us_aqi || 0),
              european_aqi: Math.round(aq.european_aqi || 0),
              pm10: Math.round(aq.pm10 * 10) / 10,
              pm2_5: Math.round(aq.pm2_5 * 10) / 10,
              carbon_monoxide: Math.round(aq.carbon_monoxide || 0),
              nitrogen_dioxide: Math.round(aq.nitrogen_dioxide * 10) / 10,
              sulphur_dioxide: Math.round(aq.sulphur_dioxide * 10) / 10,
              ozone: Math.round(aq.ozone * 10) / 10,
              quality_label,
            };
          }
        } catch (aqError) {
          console.error('Air quality fetch failed:', aqError);
        }
        
        setWeather({
          temperature: Math.round(current.temperature_2m),
          feelsLike: Math.round(current.apparent_temperature),
          condition: conditions[weatherCode] || 'Clear',
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
        });
      } catch (error) {
        console.error('Weather fetch failed:', error);
      }
    };

    // Fetch when location is available, then refresh every 10 minutes
    const lat = location?.lat ?? 40.7128;
    const lng = location?.lng ?? -74.006;
    fetchWeather(lat, lng);
    const interval = setInterval(() => fetchWeather(lat, lng), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location]);

  // ─── Update Weather Visual Effects ────────────────────────
  useEffect(() => {
    const rain = rainParticlesRef.current;
    const snow = cloudParticlesRef.current;
    
    if (rain) {
      rain.visible = weather?.isRaining ?? false;
      // Adjust rain opacity based on intensity
      if (rain.material instanceof THREE.PointsMaterial && weather?.isRaining) {
        const intensity = weather.precipitation > 5 ? 0.8 : weather.precipitation > 1 ? 0.6 : 0.4;
        rain.material.opacity = intensity;
      }
    }
    
    if (snow) {
      snow.visible = weather?.isSnowing ?? false;
    }
    
    // Adjust fog for weather
    const scene = sceneRef.current;
    if (scene && scene.fog instanceof THREE.FogExp2) {
      if (weather?.isFoggy) {
        scene.fog.density = 0.035; // Dense fog
      } else if (weather?.isRaining || weather?.isCloudy) {
        scene.fog.density = 0.018; // Light fog/haze
      } else {
        scene.fog.density = 0.012; // Clear
      }
    }
  }, [weather]);

  // ─── Dynamic Lighting Update ────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !sunLightRef.current || !ambientLightRef.current || !currentTime) return;
    
    const lat = location?.lat ?? 40.7128; // Default NYC if no location
    const lng = location?.lng ?? -74.006;
    const { altitude, azimuth } = calculateSunPosition(currentTime, lat, lng);
    
    // Sun position in 3D space (radius 25 from origin)
    const sunRadius = 25;
    const sunX = sunRadius * Math.cos(altitude) * Math.sin(azimuth);
    const sunY = sunRadius * Math.sin(altitude);
    const sunZ = sunRadius * Math.cos(altitude) * Math.cos(azimuth);
    
    const sunLight = sunLightRef.current;
    const moonLight = moonLightRef.current;
    const ambientLight = ambientLightRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    
    // Normalize altitude to 0-1 range (below horizon to zenith)
    const normalizedAlt = (altitude + Math.PI / 2) / Math.PI;
    const sunUp = altitude > 0;
    
    if (sunUp) {
      // Daytime: sun is up
      sunLight.position.set(sunX, Math.max(sunY, 2), sunZ);
      sunLight.visible = true;
      if (moonLight) moonLight.visible = false;
      
      // Sun color: warm at horizon, white at zenith
      const horizonFactor = Math.max(0, 1 - altitude / (Math.PI / 4)); // 0 at 45°+, 1 at horizon
      const sunColor = new THREE.Color().setHSL(
        0.08 - horizonFactor * 0.06, // Shift from yellow to orange near horizon
        0.4 + horizonFactor * 0.5,   // More saturated near horizon
        0.9 - horizonFactor * 0.3    // Darker near horizon
      );
      sunLight.color = sunColor;
      sunLight.intensity = 0.8 + normalizedAlt * 0.8; // 0.8 to 1.6
      
      // Ambient light: blue-ish during day
      ambientLight.color.setHSL(0.6, 0.2, 0.4 + normalizedAlt * 0.2);
      ambientLight.intensity = 0.6 + normalizedAlt * 0.4;
      
      // Sky color: from orange/pink at horizon to blue at zenith
      if (renderer && scene) {
        const skyHue = horizonFactor > 0.5 ? 0.05 : 0.6; // Orange/pink vs blue
        const skySat = horizonFactor > 0.5 ? 0.6 : 0.3;
        const skyLight = 0.15 + (1 - horizonFactor) * 0.25;
        scene.background = new THREE.Color().setHSL(skyHue, skySat, skyLight);
      }
    } else {
      // Nighttime: moon is up
      sunLight.visible = false;
      if (moonLight) {
        // Moon opposite to sun
        moonLight.position.set(-sunX, Math.max(-sunY, 5), -sunZ);
        moonLight.visible = true;
        moonLight.intensity = 0.3;
        moonLight.color.setHSL(0.6, 0.1, 0.9); // Pale blue-white
      }
      
      // Ambient: dark blue at night
      const nightDepth = Math.min(1, -altitude / (Math.PI / 6)); // How deep into night
      ambientLight.color.setHSL(0.65, 0.4, 0.15);
      ambientLight.intensity = 0.15 + (1 - nightDepth) * 0.2;
      
      // Night sky
      if (renderer && scene) {
        scene.background = new THREE.Color().setHSL(0.65, 0.5, 0.02 + (1 - nightDepth) * 0.08);
      }
    }
    
    // Update shadow camera position to follow sun/moon
    sunLight.shadow.camera.updateProjectionMatrix();
  }, [currentTime, location]);

  // ─── UI Theme Based on Time of Day ──────────────────────────
  // Default dark theme for SSR, then computed based on time after hydration
  const uiTheme = useMemo(() => {
    // Use stable dark theme for SSR (currentTime is null on server)
    if (!currentTime) {
      return {
        panelBg: 'rgba(10, 10, 26, 0.95)',
        panelBgHex: '#0a0a1a',
        borderColor: 'rgba(74, 158, 255, 0.15)',
        textPrimary: '#ffffff',
        textSecondary: '#c9d1d9',  // WCAG AA compliant on dark bg (7.5:1)
        textMuted: '#8b949e',      // WCAG AA compliant on dark bg (4.6:1)
        cardBg: 'rgba(255,255,255,0.05)',
        cardBgHover: 'rgba(74,158,255,0.12)',
        dayFactor: 0,
      };
    }
    
    const lat = location?.lat ?? 40.7128;
    const lng = location?.lng ?? -74.006;
    const { altitude } = calculateSunPosition(currentTime, lat, lng);
    
    // Normalize: 0 = midnight, 1 = noon
    const dayFactor = Math.max(0, Math.min(1, (altitude + 0.15) / (Math.PI / 2 + 0.15)));
    
    // Panel colors transition from dark (night) to light (day)
    const panelBg = `rgba(${Math.round(10 + dayFactor * 230)}, ${Math.round(10 + dayFactor * 230)}, ${Math.round(26 + dayFactor * 220)}, ${0.95 - dayFactor * 0.15})`;
    const panelBgHex = rgbToHex(
      Math.round(10 + dayFactor * 230),
      Math.round(10 + dayFactor * 230),
      Math.round(26 + dayFactor * 220)
    );
    const borderColor = `rgba(${Math.round(74 + dayFactor * 100)}, ${Math.round(158 + dayFactor * 50)}, ${Math.round(255 - dayFactor * 50)}, ${0.15 + dayFactor * 0.2})`;
    
    // WCAG AA compliant text colors for both day and night modes
    const textPrimary = dayFactor > 0.5 ? '#1a1a1a' : '#ffffff';
    const textSecondary = dayFactor > 0.5 ? '#3a3a3a' : '#c9d1d9';  // 7.5:1 on dark, 10.5:1 on light
    const textMuted = dayFactor > 0.5 ? '#5a5a5a' : '#8b949e';      // 4.6:1 on dark, 6.4:1 on light
    
    const cardBg = dayFactor > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    const cardBgHover = dayFactor > 0.5 ? 'rgba(74,158,255,0.15)' : 'rgba(74,158,255,0.12)';
    
    return { panelBg, panelBgHex, borderColor, textPrimary, textSecondary, textMuted, cardBg, cardBgHover, dayFactor };
  }, [currentTime, location]);

  // ─── Fetch comments/votes when a post is selected ──────────────
  const selectPost = useCallback((msg: ActivityMessage | null) => {
    setSelectedPost(msg);
    setPostDetail(null);
    if (msg?.postId) {
      setDetailLoading(true);
      Promise.all([
        fetch(`/api/v1/comments?postId=${msg.postId}`).then(r => r.json()),
        fetch(`/api/v1/posts?limit=1&offset=0`).then(r => r.json()),
      ]).then(([commentsData]) => {
        const comments = commentsData.data?.comments || commentsData.comments || [];
        // Fetch the individual post for vote data
        fetch(`/api/v1/posts?limit=100`).then(r => r.json()).then(postsData => {
          const posts = postsData.data?.posts || postsData.posts || [];
          const match = posts.find((p: { id: string }) => p.id === msg.postId);
          setPostDetail({
            comments,
            score: match?.score || 0,
            upvotes: match?.upvotes || 0,
            downvotes: match?.downvotes || 0,
            commentCount: comments.length,
          });
          setDetailLoading(false);
        });
      }).catch(() => setDetailLoading(false));
    }
  }, []);

  // ─── Load recent posts on mount ────────────────────────────────
  useEffect(() => {
    const botColorMap: Record<string, string> = {
      TechBot: '#4a9eff',
      PhilosopherBot: '#b366ff',
      ArtBot: '#ff8c42',
      ScienceBot: '#42d68c',
      PirateBot: '#cc88ff',
    };
    fetch('/api/v1/posts?limit=25')
      .then(res => res.json())
      .then(data => {
        const posts = data.data?.posts || data.posts || [];
        const messages: ActivityMessage[] = posts.map((p: { id: string; agent: { name: string }; title: string; content: string; createdAt: string }) => ({
          id: p.id,
          postId: p.id,
          botName: p.agent.name,
          botColor: botColorMap[p.agent.name] || '#888',
          text: p.title || p.content.substring(0, 80),
          content: p.content,
          time: new Date(p.createdAt).toLocaleTimeString(),
        }));
        setActivityFeed(messages);
      })
      .catch(err => console.error('Failed to load posts:', err));
  }, []);

  const handleReset = useCallback(() => {
    // Reset camera
    if (cameraRef.current) {
      cameraRef.current.position.set(15, 20, 15);
      cameraRef.current.lookAt(0, 0, 0);
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    // Clear bot entities with proper Three.js resource disposal
    for (const entity of botsRef.current.values()) {
      if (sceneRef.current) sceneRef.current.remove(entity.group);
      // Dispose Three.js resources to prevent GPU memory leaks
      entity.mesh.geometry.dispose();
      const material = entity.mesh.material;
      if (Array.isArray(material)) {
        material.forEach(m => m.dispose());
      } else {
        material.dispose();
      }
      entity.label.remove();
      entity.speechBubble.remove();
    }
    botsRef.current.clear();
    
    // Clear corn field so it can be recreated
    foodSpotsRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    foodSpotsRef.current = [];
    cornInitializedRef.current = false;
    cornTargetScaleRef.current = 1;
    
    // Clear wood/stone/shelters so they can be recreated
    woodSpotsRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
          else child.material.dispose();
        }
      });
    });
    woodSpotsRef.current = [];
    woodInitializedRef.current = false;
    
    stoneSpotsRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
          else child.material.dispose();
        }
      });
    });
    stoneSpotsRef.current = [];
    stoneInitializedRef.current = false;
    
    sheltersRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
          else child.material.dispose();
        }
      });
    });
    sheltersRef.current.clear();
    
    // Remove sundial if it exists
    if (sundialRef.current && sceneRef.current) {
      sceneRef.current.remove(sundialRef.current);
      sundialRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
          else child.material.dispose();
        }
      });
      sundialRef.current = null;
    }
    sundialInitializedRef.current = false;
    
    // Reconnect WebSocket to get fresh world:init
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  // ─── Dynamic Ground Sizing Based on Bot Count ────────────────
  const calculateGroundSize = useCallback((botCount: number): number => {
    // 75 square meters per bot
    // Side length = √(botCount × 75)
    const SQUARE_METERS_PER_BOT = 75;
    const MIN_SIZE = 10; // minimum 10x10 for empty world
    
    const area = Math.max(1, botCount) * SQUARE_METERS_PER_BOT;
    const size = Math.sqrt(area);
    return Math.max(MIN_SIZE, Math.round(size));
  }, []);

  const resizeGroundForBots = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !groundRef.current || !gridRef.current) return;

    const botCount = botsRef.current.size;
    const size = calculateGroundSize(botCount);
    
    // Only resize if size changed significantly (avoid constant updates)
    const currentSize = (groundRef.current.geometry as THREE.PlaneGeometry).parameters.width;
    if (Math.abs(currentSize - size) < 2) return;

    // Resize ground
    groundRef.current.geometry.dispose();
    groundRef.current.geometry = new THREE.PlaneGeometry(size, size);

    // Resize grid
    scene.remove(gridRef.current);
    gridRef.current.geometry.dispose();
    gridRef.current.material.dispose();
    const newGrid = new THREE.GridHelper(size, Math.round(size), 0x1a6b2a, 0x238636);
    newGrid.position.y = 0.01;
    scene.add(newGrid);
    gridRef.current = newGrid;

    console.log(`[Simulation] Resized ground to ${size}x${size} for ${botCount} bots`);
  }, [calculateGroundSize]);

  // ─── Create Bot 3D Entity ────────────────────────────────────

  const createBot = useCallback((data: BotData) => {
    const scene = sceneRef.current;
    const labelsContainer = labelsRef.current;
    if (!scene || !labelsContainer) return;

    if (botsRef.current.has(data.botId)) {
      // Already exists — just update position
      const entity = botsRef.current.get(data.botId)!;
      entity.targetPos.set(data.x, (data.height || 1.0) / 2, data.z);
      entity.data = data;
      return;
    }

    const visual = BOT_VISUALS[data.personality] || BOT_VISUALS.tech;

    // Use server-provided random dimensions, fallback to defaults
    const w = data.width || 0.65;
    const h = data.height || 1.0;
    const botColor = data.color
      ? new THREE.Color(data.color)
      : new THREE.Color(visual.color);
    const emissiveColor = botColor.clone().multiplyScalar(0.3);

    // Create group
    const group = new THREE.Group();
    group.position.set(data.x, h / 2, data.z);

    // Main mesh — box with random width & height
    const geometry = new THREE.BoxGeometry(w, h, w);
    const material = new THREE.MeshStandardMaterial({
      color: botColor,
      emissive: emissiveColor,
      emissiveIntensity: 0.3,
      metalness: 0.3,
      roughness: 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Glow ring at base
    const ringGeo = new THREE.RingGeometry(w * 0.8, w * 1.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: botColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.45;
    group.add(ring);

    scene.add(group);

    // HTML label
    const label = document.createElement('div');
    label.className = 'bot-label';
    label.innerHTML = `${visual.emoji} ${data.botName}`;
    labelsContainer.appendChild(label);

    // Speech bubble
    const speechBubble = document.createElement('div');
    speechBubble.className = 'speech-bubble';
    speechBubble.style.display = 'none';
    labelsContainer.appendChild(speechBubble);

    // Store botId on mesh for raycasting click detection
    mesh.userData = { botId: data.botId };

    const entity: BotEntity = {
      group,
      mesh,
      label,
      speechBubble,
      targetPos: new THREE.Vector3(data.x, h / 2, data.z),
      data,
      postCount: 0,
      recentPost: undefined,
    };

    botsRef.current.set(data.botId, entity);
    
    // Resize ground based on new bot count
    resizeGroundForBots();
  }, [resizeGroundForBots]);

  // ─── Show Speech Bubble ──────────────────────────────────────

  const showSpeechBubble = useCallback((botId: string, title: string) => {
    const entity = botsRef.current.get(botId);
    if (!entity) return;

    entity.speechBubble.textContent = title;
    entity.speechBubble.style.display = 'block';

    setTimeout(() => {
      entity.speechBubble.style.display = 'none';
    }, 6000);
  }, []);

  // ─── Main Setup ──────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const labelsContainer = labelsRef.current;
    if (!container || !labelsContainer) return;

    // ─── Scene ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);
    sceneRef.current = scene;

    // ─── Camera ────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    camera.position.set(15, 20, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // ─── Renderer ──────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ─── Raycaster for Click Detection ─────────────────
    const raycaster = new THREE.Raycaster();
    raycasterRef.current = raycaster;

    // ─── Controls ──────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // ─── Ground (sized dynamically based on bot count) ───
    const defaultSize = 20; // initial default; auto-resized when bots are added
    const groundGeo = new THREE.PlaneGeometry(defaultSize, defaultSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2d8c3c,
      metalness: 0.05,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    // Grid: 1 cell = 1 meter
    const grid = new THREE.GridHelper(defaultSize, defaultSize, 0x1a6b2a, 0x238636);
    grid.position.y = 0.01;
    scene.add(grid);
    gridRef.current = grid;

    // ─── Lighting (dynamic sun/moon based on user location/time) ───
    const ambientLight = new THREE.AmbientLight(0x334466, 0.8);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    // Sun light (directional, casts shadows)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Moon light (for nighttime, softer shadows)
    const moonLight = new THREE.DirectionalLight(0x8899bb, 0.3);
    moonLight.position.set(-10, 15, -10);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    moonLight.shadow.camera.near = 0.5;
    moonLight.shadow.camera.far = 50;
    moonLight.shadow.camera.left = -20;
    moonLight.shadow.camera.right = 20;
    moonLight.shadow.camera.top = 20;
    moonLight.shadow.camera.bottom = -20;
    moonLight.visible = false; // Hidden during day
    scene.add(moonLight);
    moonLightRef.current = moonLight;

    // Accent lights
    const pointLight1 = new THREE.PointLight(0x4a9eff, 0.5, 30);
    pointLight1.position.set(-10, 5, -10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xb366ff, 0.5, 30);
    pointLight2.position.set(10, 5, 10);
    scene.add(pointLight2);

    // ─── Weather Particle Systems ──────────────────────
    // Rain particles
    const rainCount = 3000;
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    const rainVelocities = new Float32Array(rainCount); // Store Y velocity
    
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 60;     // X
      rainPositions[i * 3 + 1] = Math.random() * 30;          // Y
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;  // Z
      rainVelocities[i] = 0.3 + Math.random() * 0.4;          // Fall speed
    }
    
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(rainVelocities, 1));
    
    const rainMaterial = new THREE.PointsMaterial({
      color: 0x6699cc,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    
    const rainParticles = new THREE.Points(rainGeometry, rainMaterial);
    rainParticles.visible = false; // Hidden by default
    scene.add(rainParticles);
    rainParticlesRef.current = rainParticles;

    // Snow particles (reuse for snow effect)
    const snowCount = 2000;
    const snowGeometry = new THREE.BufferGeometry();
    const snowPositions = new Float32Array(snowCount * 3);
    const snowDrifts = new Float32Array(snowCount); // Horizontal drift
    
    for (let i = 0; i < snowCount; i++) {
      snowPositions[i * 3] = (Math.random() - 0.5) * 60;
      snowPositions[i * 3 + 1] = Math.random() * 25;
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      snowDrifts[i] = (Math.random() - 0.5) * 0.02;
    }
    
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    snowGeometry.setAttribute('drift', new THREE.BufferAttribute(snowDrifts, 1));
    
    const snowMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    
    const snowParticles = new THREE.Points(snowGeometry, snowMaterial);
    snowParticles.visible = false;
    scene.add(snowParticles);
    cloudParticlesRef.current = snowParticles; // Reuse cloudParticlesRef for snow

    // ─── Animation Loop ────────────────────────────────
    const clock = new THREE.Clock();
    let rafId: number;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      controls.update();

      // Update bot entities
      for (const entity of botsRef.current.values()) {
        // Smooth movement toward target
        entity.group.position.lerp(entity.targetPos, 0.08);

        // Gentle bobbing
        entity.mesh.position.y = Math.sin(elapsed * 2 + entity.group.position.x) * 0.05;

        // Gentle rotation
        entity.mesh.rotation.y += delta * 0.3;

        // Project to screen for HTML labels
        const pos = entity.group.position.clone();
        pos.y += 1.5;
        pos.project(camera);

        const x = (pos.x * 0.5 + 0.5) * container!.clientWidth;
        const y = (-pos.y * 0.5 + 0.5) * container!.clientHeight;

        if (pos.z < 1) {
          entity.label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
          entity.label.style.display = 'block';
          entity.speechBubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 30}px)`;
        } else {
          entity.label.style.display = 'none';
          entity.speechBubble.style.display = 'none';
        }

        // Glow ring pulse based on state
        const ring = entity.group.children[1] as THREE.Mesh;
        if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
          if (entity.data.state === 'speaking') {
            ring.material.opacity = 0.5 + Math.sin(elapsed * 5) * 0.3;
          } else if (entity.data.state === 'wandering') {
            ring.material.opacity = 0.2 + Math.sin(elapsed * 2) * 0.1;
          } else {
            ring.material.opacity = 0.15;
          }
        }
      }

      // ─── Animate Rain Particles ────────────────────
      if (rainParticles.visible) {
        const positions = rainGeometry.attributes.position.array as Float32Array;
        const velocities = rainGeometry.attributes.velocity.array as Float32Array;
        
        for (let i = 0; i < rainCount; i++) {
          positions[i * 3 + 1] -= velocities[i]; // Fall down
          
          // Reset to top when below ground
          if (positions[i * 3 + 1] < 0) {
            positions[i * 3 + 1] = 25 + Math.random() * 5;
            positions[i * 3] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
          }
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }

      // ─── Animate Snow Particles ────────────────────
      if (snowParticles.visible) {
        const positions = snowGeometry.attributes.position.array as Float32Array;
        const drifts = snowGeometry.attributes.drift.array as Float32Array;
        
        for (let i = 0; i < snowCount; i++) {
          positions[i * 3 + 1] -= 0.03; // Slow fall
          positions[i * 3] += drifts[i] + Math.sin(elapsed + i) * 0.005; // Drift
          positions[i * 3 + 2] += Math.cos(elapsed * 0.7 + i) * 0.003;
          
          // Reset to top when below ground
          if (positions[i * 3 + 1] < 0) {
            positions[i * 3 + 1] = 20 + Math.random() * 5;
            positions[i * 3] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
          }
        }
        snowGeometry.attributes.position.needsUpdate = true;
      }

      // ─── Animate Corn Field (grow/shrink) ────────────────────
      for (const cornGroup of foodSpotsRef.current) {
        const currentScale = cornGroup.scale.x;
        const targetScale = cornTargetScaleRef.current;
        
        // Smoothly interpolate toward target scale
        if (Math.abs(currentScale - targetScale) > 0.01) {
          const newScale = currentScale + (targetScale - currentScale) * 0.05;
          cornGroup.scale.set(newScale, newScale, newScale);
        }
      }

      renderer.render(scene, camera);
    }

    animate();

    // ─── Resize Handler ────────────────────────────────
    function onResize() {
      camera.aspect = container!.clientWidth / container!.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container!.clientWidth, container!.clientHeight);
    }
    window.addEventListener('resize', onResize);

    // ─── Click Handler for Bot Selection ───────────────
    function onCanvasClick(event: MouseEvent) {
      if (!raycasterRef.current || !cameraRef.current) return;
      
      // Calculate mouse position in normalized device coordinates
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update raycaster
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      
      // Get all bot meshes
      const botMeshes: THREE.Mesh[] = [];
      for (const entity of botsRef.current.values()) {
        botMeshes.push(entity.mesh);
      }
      
      // Check for intersections
      const intersects = raycasterRef.current.intersectObjects(botMeshes, false);
      
      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh;
        const botId = clickedMesh.userData.botId;
        
        if (botId) {
          const entity = botsRef.current.get(botId);
          
          // Set selected bot info for metrics panel
          if (entity) {
            const visual = BOT_VISUALS[entity.data.personality] || BOT_VISUALS.tech;
            setSelectedBotInfo({
              botId: entity.data.botId,
              botName: entity.data.botName,
              personality: entity.data.personality,
              postCount: entity.postCount,
              color: entity.data.color || `#${visual.color.toString(16).padStart(6, '0')}`,
              state: entity.data.state,
              height: entity.data.height,
              lastPostTime: entity.recentPost?.time,
              needs: entity.data.needs,
              inventory: entity.data.inventory,
            });
          }
          
          if (entity && entity.recentPost) {
            // Show recent post in speech bubble
            entity.speechBubble.textContent = entity.recentPost.text;
            entity.speechBubble.style.display = 'block';
            
            // Auto-hide after 8 seconds
            setTimeout(() => {
              entity.speechBubble.style.display = 'none';
            }, 8000);
            
            // Select in detail panel
            setSelectedPost(entity.recentPost);
            setPostDetail(null);
            
            // Fetch post details if we have a postId
            if (entity.recentPost.postId) {
              setDetailLoading(true);
              Promise.all([
                fetch(`/api/v1/comments?postId=${entity.recentPost.postId}`).then(r => r.json()),
                fetch(`/api/v1/posts?limit=100`).then(r => r.json()),
              ]).then(([commentsData, postsData]) => {
                const comments = commentsData.data?.comments || commentsData.comments || [];
                const posts = postsData.data?.posts || postsData.posts || [];
                const match = posts.find((p: { id: string }) => p.id === entity.recentPost!.postId);
                setPostDetail({
                  comments,
                  score: match?.score || 0,
                  upvotes: match?.upvotes || 0,
                  downvotes: match?.downvotes || 0,
                  commentCount: comments.length,
                });
                setDetailLoading(false);
              }).catch(() => setDetailLoading(false));
            }
          } else if (entity) {
            // No posts yet - show message
            entity.speechBubble.textContent = '🤔 No posts yet...';
            entity.speechBubble.style.display = 'block';
            setTimeout(() => {
              entity.speechBubble.style.display = 'none';
            }, 3000);
          }
        }
      }
    }
    renderer.domElement.addEventListener('click', onCanvasClick);

    // ─── WebSocket Connection ──────────────────────────
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    function connectWebSocket() {
      if (disposed) return;
      const ws = new WebSocket('ws://localhost:8080');
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        console.log('🔌 Connected to simulation bridge');
        if (statusRef.current) {
          statusRef.current.textContent = '🟢 Connected';
          statusRef.current.style.color = '#4ade80';
        }
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'world:init':
            case 'world:update':
              // Resize ground if worldConfig changed
              if (msg.data.worldConfig) {
                const r = msg.data.worldConfig.groundRadius;
                const diameter = r * 2;
                if (groundRef.current) {
                  groundRef.current.geometry.dispose();
                  groundRef.current.geometry = new THREE.PlaneGeometry(diameter, diameter);
                }
                if (gridRef.current) {
                  scene.remove(gridRef.current);
                  gridRef.current.dispose();
                  // 1 cell = 1 meter
                  const newGrid = new THREE.GridHelper(diameter, Math.round(diameter), 0x1a6b2a, 0x238636);
                  newGrid.position.y = 0.01;
                  scene.add(newGrid);
                  gridRef.current = newGrid;
                }
                
                // Render water spots for bot survival
                if (msg.data.worldConfig.waterSpots) {
                  // Remove old water spots
                  waterSpotsRef.current.forEach(mesh => {
                    scene.remove(mesh);
                    mesh.geometry.dispose();
                    if (Array.isArray(mesh.material)) {
                      mesh.material.forEach(mat => mat.dispose());
                    } else {
                      mesh.material.dispose();
                    }
                  });
                  waterSpotsRef.current = [];
                  
                  // Create new water spots
                  msg.data.worldConfig.waterSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const waterGeo = new THREE.CircleGeometry(spot.radius, 32);
                    const waterMat = new THREE.MeshStandardMaterial({
                      color: 0x2196f3,
                      metalness: 0.8,
                      roughness: 0.2,
                      transparent: true,
                      opacity: 0.7,
                    });
                    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
                    waterMesh.rotation.x = -Math.PI / 2;
                    waterMesh.position.set(spot.x, 0.02, spot.z); // Slightly above ground
                    scene.add(waterMesh);
                    waterSpotsRef.current.push(waterMesh);
                    console.log(`💧 Rendered water spot at (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}) with radius ${spot.radius}m`);
                  });
                }
                
                // Render food spots for bot survival (only create once)
                if (msg.data.worldConfig.foodSpots && !cornInitializedRef.current) {
                  cornInitializedRef.current = true;
                  
                  // Create new food spots as corn stalks
                  msg.data.worldConfig.foodSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    // Create a group to hold all corn stalks
                    const cornGroup = new THREE.Group();
                    cornGroup.position.set(spot.x, 0, spot.z);
                    cornGroup.scale.set(0, 0, 0); // Start at scale 0 for grow animation
                    
                    // Store spot info for later reference
                    cornGroup.userData = { spotX: spot.x, spotZ: spot.z, radius: spot.radius };
                    
                    // Number of stalks based on radius
                    const stalkCount = Math.floor(spot.radius * 8);
                    
                    for (let i = 0; i < stalkCount; i++) {
                      // Fixed position within the spot radius (deterministic grid)
                      const gridAngle = (i / stalkCount) * Math.PI * 2;
                      const ringIndex = Math.floor(i / 6);
                      const dist = (0.3 + ringIndex * 0.35) * Math.min(spot.radius * 0.9, 1.2);
                      const sx = Math.cos(gridAngle + ringIndex * 0.3) * dist;
                      const sz = Math.sin(gridAngle + ringIndex * 0.3) * dist;
                      
                      // Stalk height varies but is fixed per position
                      const stalkHeight = 0.9 + (i % 3) * 0.25;
                      
                      // Green stalk (cylinder)
                      const stalkGeo = new THREE.CylinderGeometry(0.03, 0.04, stalkHeight, 6);
                      const stalkMat = new THREE.MeshStandardMaterial({
                        color: 0x228b22, // Forest green
                        metalness: 0.1,
                        roughness: 0.8,
                      });
                      const stalk = new THREE.Mesh(stalkGeo, stalkMat);
                      stalk.position.set(sx, stalkHeight / 2, sz);
                      // Slight deterministic lean based on position
                      stalk.rotation.x = Math.sin(i * 1.3) * 0.1;
                      stalk.rotation.z = Math.cos(i * 1.7) * 0.1;
                      stalk.castShadow = true;
                      cornGroup.add(stalk);
                      
                      // Yellow corn cob at top
                      const cobGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.2, 8);
                      const cobMat = new THREE.MeshStandardMaterial({
                        color: 0xffd700, // Gold/yellow
                        metalness: 0.2,
                        roughness: 0.6,
                      });
                      const cob = new THREE.Mesh(cobGeo, cobMat);
                      cob.position.set(sx, stalkHeight - 0.05, sz);
                      cob.rotation.x = stalk.rotation.x;
                      cob.rotation.z = stalk.rotation.z;
                      cornGroup.add(cob);
                      
                      // Green leaf/husk around cob
                      const leafGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
                      const leafMat = new THREE.MeshStandardMaterial({
                        color: 0x32cd32, // Lime green
                        metalness: 0.1,
                        roughness: 0.9,
                        side: THREE.DoubleSide,
                      });
                      const leaf = new THREE.Mesh(leafGeo, leafMat);
                      leaf.position.set(sx, stalkHeight + 0.05, sz);
                      leaf.rotation.x = Math.PI + stalk.rotation.x;
                      cornGroup.add(leaf);
                    }
                    
                    // Add dirt patch underneath
                    const dirtGeo = new THREE.CircleGeometry(spot.radius, 16);
                    const dirtMat = new THREE.MeshStandardMaterial({
                      color: 0x5c4033, // Dark brown dirt
                      metalness: 0.0,
                      roughness: 1.0,
                    });
                    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
                    dirt.rotation.x = -Math.PI / 2;
                    dirt.position.y = 0.01;
                    cornGroup.add(dirt);
                    
                    scene.add(cornGroup);
                    foodSpotsRef.current.push(cornGroup);
                    console.log(`🌽 Rendered corn field at (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}) with ${stalkCount} stalks`);
                  });
                  
                  // Set target scale to 1 to trigger grow animation
                  cornTargetScaleRef.current = 1;
                }
                
                // Render wood spots (forest with trees) - only create once
                if (msg.data.worldConfig.woodSpots && !woodInitializedRef.current) {
                  woodInitializedRef.current = true;
                  
                  msg.data.worldConfig.woodSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const forestGroup = new THREE.Group();
                    forestGroup.position.set(spot.x, 0, spot.z);
                    
                    // Create multiple trees
                    const treeCount = Math.floor(spot.radius * 4);
                    for (let i = 0; i < treeCount; i++) {
                      const treeGroup = new THREE.Group();
                      
                      // Position trees in spots within radius
                      const angle = (i / treeCount) * Math.PI * 2;
                      const ring = Math.floor(i / 5);
                      const dist = 0.4 + ring * 0.6;
                      const tx = Math.cos(angle + ring * 0.5) * dist * Math.min(spot.radius * 0.8, 2);
                      const tz = Math.sin(angle + ring * 0.5) * dist * Math.min(spot.radius * 0.8, 2);
                      treeGroup.position.set(tx, 0, tz);
                      
                      // Tree trunk (brown cylinder)
                      const trunkHeight = 1.2 + (i % 3) * 0.3;
                      const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, trunkHeight, 8);
                      const trunkMat = new THREE.MeshStandardMaterial({
                        color: 0x8b4513, // Saddle brown
                        metalness: 0.0,
                        roughness: 0.9,
                      });
                      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                      trunk.position.y = trunkHeight / 2;
                      trunk.castShadow = true;
                      treeGroup.add(trunk);
                      
                      // Tree foliage (green cone)
                      const foliageHeight = 1.0 + (i % 2) * 0.4;
                      const foliageGeo = new THREE.ConeGeometry(0.5, foliageHeight, 8);
                      const foliageMat = new THREE.MeshStandardMaterial({
                        color: 0x228b22, // Forest green
                        metalness: 0.0,
                        roughness: 0.8,
                      });
                      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
                      foliage.position.y = trunkHeight + foliageHeight / 2 - 0.2;
                      foliage.castShadow = true;
                      treeGroup.add(foliage);
                      
                      forestGroup.add(treeGroup);
                    }
                    
                    // Brown dirt patch under forest
                    const dirtGeo = new THREE.CircleGeometry(spot.radius, 16);
                    const dirtMat = new THREE.MeshStandardMaterial({
                      color: 0x654321, // Dark brown
                      metalness: 0.0,
                      roughness: 1.0,
                    });
                    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
                    dirt.rotation.x = -Math.PI / 2;
                    dirt.position.y = 0.01;
                    forestGroup.add(dirt);
                    
                    scene.add(forestGroup);
                    woodSpotsRef.current.push(forestGroup);
                    console.log(`🌲 Rendered forest at (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}) with ${treeCount} trees`);
                  });
                }
                
                // Render stone spots (quarry with rocks) - only create once
                if (msg.data.worldConfig.stoneSpots && !stoneInitializedRef.current) {
                  stoneInitializedRef.current = true;
                  
                  msg.data.worldConfig.stoneSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const quarryGroup = new THREE.Group();
                    quarryGroup.position.set(spot.x, 0, spot.z);
                    
                    // Create multiple rocks
                    const rockCount = Math.floor(spot.radius * 5);
                    for (let i = 0; i < rockCount; i++) {
                      // Position rocks within radius
                      const angle = (i / rockCount) * Math.PI * 2 + (i % 2) * 0.3;
                      const dist = 0.3 + (i % 3) * 0.4;
                      const rx = Math.cos(angle) * dist * Math.min(spot.radius * 0.7, 1.5);
                      const rz = Math.sin(angle) * dist * Math.min(spot.radius * 0.7, 1.5);
                      
                      // Rock (irregular dodecahedron)
                      const rockSize = 0.2 + (i % 3) * 0.15;
                      const rockGeo = new THREE.DodecahedronGeometry(rockSize, 0);
                      const rockMat = new THREE.MeshStandardMaterial({
                        color: 0x808080, // Gray
                        metalness: 0.1,
                        roughness: 0.9,
                      });
                      const rock = new THREE.Mesh(rockGeo, rockMat);
                      rock.position.set(rx, rockSize * 0.5, rz);
                      rock.rotation.x = i * 0.5;
                      rock.rotation.z = i * 0.3;
                      rock.castShadow = true;
                      quarryGroup.add(rock);
                    }
                    
                    // Gray gravel patch under quarry
                    const gravelGeo = new THREE.CircleGeometry(spot.radius, 16);
                    const gravelMat = new THREE.MeshStandardMaterial({
                      color: 0x696969, // Dim gray
                      metalness: 0.0,
                      roughness: 1.0,
                    });
                    const gravel = new THREE.Mesh(gravelGeo, gravelMat);
                    gravel.rotation.x = -Math.PI / 2;
                    gravel.position.y = 0.01;
                    quarryGroup.add(gravel);
                    
                    scene.add(quarryGroup);
                    stoneSpotsRef.current.push(quarryGroup);
                    console.log(`🪨 Rendered quarry at (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}) with ${rockCount} rocks`);
                  });
                }
                
                // Render sundial (community time-keeping structure) - only create once
                if (msg.data.worldConfig.sundial && !sundialInitializedRef.current) {
                  sundialInitializedRef.current = true;
                  const sundial = msg.data.worldConfig.sundial;
                  
                  const sundialGroup = new THREE.Group();
                  sundialGroup.position.set(sundial.x, 0, sundial.z);
                  // Rotate to face north (negative Z direction)
                  sundialGroup.rotation.y = Math.PI; // Face north
                  
                  // Circular base platform (stone)
                  const baseRadius = sundial.radius;
                  const baseGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.1, 0.15, 32);
                  const baseMat = new THREE.MeshStandardMaterial({
                    color: 0x8b8b83, // Stone gray
                    metalness: 0.1,
                    roughness: 0.9,
                  });
                  const base = new THREE.Mesh(baseGeo, baseMat);
                  base.position.y = 0.075;
                  base.castShadow = true;
                  base.receiveShadow = true;
                  sundialGroup.add(base);
                  
                  // Dial face (flat top surface with hour lines)
                  const dialGeo = new THREE.CircleGeometry(baseRadius * 0.9, 32);
                  const dialMat = new THREE.MeshStandardMaterial({
                    color: 0xf5f5dc, // Beige
                    metalness: 0.0,
                    roughness: 0.7,
                  });
                  const dial = new THREE.Mesh(dialGeo, dialMat);
                  dial.rotation.x = -Math.PI / 2;
                  dial.position.y = 0.16;
                  sundialGroup.add(dial);
                  
                  // Hour markings (12 lines radiating from center)
                  for (let h = 0; h < 12; h++) {
                    const angle = (h / 12) * Math.PI * 2 - Math.PI / 2; // Start from 12 o'clock
                    const lineGeo = new THREE.BoxGeometry(0.02, 0.01, baseRadius * 0.3);
                    const lineMat = new THREE.MeshStandardMaterial({
                      color: 0x333333,
                      metalness: 0.0,
                      roughness: 0.8,
                    });
                    const line = new THREE.Mesh(lineGeo, lineMat);
                    line.position.x = Math.cos(angle) * baseRadius * 0.65;
                    line.position.z = Math.sin(angle) * baseRadius * 0.65;
                    line.position.y = 0.17;
                    line.rotation.y = -angle;
                    sundialGroup.add(line);
                  }
                  
                  // Triangular gnomon (the shadow-casting part)
                  // Classic right-triangle shape pointing north
                  const gnomonHeight = baseRadius * 0.8;
                  const gnomonLength = baseRadius * 0.9;
                  const gnomonShape = new THREE.Shape();
                  gnomonShape.moveTo(0, 0);
                  gnomonShape.lineTo(gnomonLength, 0);
                  gnomonShape.lineTo(0, gnomonHeight);
                  gnomonShape.lineTo(0, 0);
                  
                  const gnomonGeo = new THREE.ExtrudeGeometry(gnomonShape, {
                    depth: 0.05,
                    bevelEnabled: false,
                  });
                  const gnomonMat = new THREE.MeshStandardMaterial({
                    color: 0xcd7f32, // Bronze
                    metalness: 0.6,
                    roughness: 0.3,
                  });
                  const gnomon = new THREE.Mesh(gnomonGeo, gnomonMat);
                  gnomon.position.set(-0.025, 0.16, 0);
                  gnomon.rotation.x = -Math.PI / 2;
                  gnomon.rotation.z = Math.PI / 2;
                  gnomon.castShadow = true;
                  sundialGroup.add(gnomon);
                  
                  // Small decorative ring around base
                  const ringGeo = new THREE.TorusGeometry(baseRadius * 1.05, 0.03, 8, 32);
                  const ringMat = new THREE.MeshStandardMaterial({
                    color: 0x4a4a4a, // Dark gray
                    metalness: 0.3,
                    roughness: 0.7,
                  });
                  const ring = new THREE.Mesh(ringGeo, ringMat);
                  ring.rotation.x = -Math.PI / 2;
                  ring.position.y = 0.08;
                  sundialGroup.add(ring);
                  
                  scene.add(sundialGroup);
                  sundialRef.current = sundialGroup;
                  console.log(`☀️ Rendered sundial at (${sundial.x.toFixed(1)}, ${sundial.z.toFixed(1)}) facing north`);
                }
                
                // Render shelters (huts) - dynamic, update on each tick
                if (msg.data.worldConfig.shelters) {
                  interface ShelterData {
                    id: string;
                    type: string; // hut, cabin, house, etc.
                    x: number;
                    z: number;
                    built: boolean;
                    buildProgress: number;
                    ownerId: string | null;
                  }
                  
                  msg.data.worldConfig.shelters.forEach((shelter: ShelterData) => {
                    let shelterObj = sheltersRef.current.get(shelter.id);
                    
                    if (!shelterObj) {
                      // Create new shelter
                      shelterObj = new THREE.Group();
                      shelterObj.position.set(shelter.x, 0, shelter.z);
                      sheltersRef.current.set(shelter.id, shelterObj);
                      scene.add(shelterObj);
                    }
                    
                    // Clear existing children and rebuild based on state
                    while (shelterObj.children.length > 0) {
                      const child = shelterObj.children[0];
                      shelterObj.remove(child);
                      if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        if (Array.isArray(child.material)) {
                          child.material.forEach(m => m.dispose());
                        } else {
                          child.material.dispose();
                        }
                      }
                    }
                    
                    if (shelter.built) {
                      // Complete hut - simple A-frame cabin (1m x 1m footprint)
                      // Base/floor (wooden platform)
                      const floorGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
                      const floorMat = new THREE.MeshStandardMaterial({
                        color: 0x8b4513, // Brown
                        metalness: 0.0,
                        roughness: 0.9,
                      });
                      const floor = new THREE.Mesh(floorGeo, floorMat);
                      floor.position.y = 0.05;
                      shelterObj.add(floor);
                      
                      // Walls (simple box frame)
                      const wallMat = new THREE.MeshStandardMaterial({
                        color: 0xa0522d, // Sienna
                        metalness: 0.0,
                        roughness: 0.8,
                      });
                      
                      // Front/back walls - front has a doorway gap
                      const wallGeo = new THREE.BoxGeometry(0.9, 0.8, 0.08);
                      // Back wall (solid)
                      const backWall = new THREE.Mesh(wallGeo, wallMat);
                      backWall.position.set(0, 0.5, -0.42);
                      shelterObj.add(backWall);
                      
                      // Front wall left side (leaving doorway in center)
                      const frontWallHalfGeo = new THREE.BoxGeometry(0.3, 0.8, 0.08);
                      const frontWallLeft = new THREE.Mesh(frontWallHalfGeo, wallMat);
                      frontWallLeft.position.set(-0.3, 0.5, 0.42);
                      shelterObj.add(frontWallLeft);
                      
                      const frontWallRight = new THREE.Mesh(frontWallHalfGeo, wallMat);
                      frontWallRight.position.set(0.3, 0.5, 0.42);
                      shelterObj.add(frontWallRight);
                      
                      // Side walls
                      const sideWallGeo = new THREE.BoxGeometry(0.08, 0.8, 0.84);
                      const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
                      leftWall.position.set(-0.42, 0.5, 0);
                      shelterObj.add(leftWall);
                      
                      const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
                      rightWall.position.set(0.42, 0.5, 0);
                      shelterObj.add(rightWall);
                      
                      // Roof (two angled planes forming A-frame)
                      const roofMat = new THREE.MeshStandardMaterial({
                        color: 0x654321, // Dark brown
                        metalness: 0.0,
                        roughness: 0.9,
                        side: THREE.DoubleSide,
                      });
                      const roofGeo = new THREE.BoxGeometry(1.1, 0.08, 0.7);
                      
                      const leftRoof = new THREE.Mesh(roofGeo, roofMat);
                      leftRoof.position.set(0, 1.0, -0.22);
                      leftRoof.rotation.x = Math.PI * 0.2;
                      shelterObj.add(leftRoof);
                      
                      const rightRoof = new THREE.Mesh(roofGeo, roofMat);
                      rightRoof.position.set(0, 1.0, 0.22);
                      rightRoof.rotation.x = -Math.PI * 0.2;
                      shelterObj.add(rightRoof);
                      
                      console.log(`🏠 Shelter ${shelter.id} is complete`);
                    } else if (shelter.buildProgress > 0) {
                      // Under construction - show partial structure (1m x 1m)
                      const progress = shelter.buildProgress / 100;
                      
                      // Foundation always visible
                      const foundationGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
                      const foundationMat = new THREE.MeshStandardMaterial({
                        color: 0x808080, // Gray stone
                        metalness: 0.1,
                        roughness: 0.9,
                      });
                      const foundation = new THREE.Mesh(foundationGeo, foundationMat);
                      foundation.position.y = 0.05;
                      shelterObj.add(foundation);
                      
                      // Partial walls based on progress
                      if (progress > 0.3) {
                        const wallMat = new THREE.MeshStandardMaterial({
                          color: 0xa0522d,
                          transparent: true,
                          opacity: Math.min(1, progress * 1.5),
                        });
                        const wallHeight = Math.min(0.8, progress * 1.6);
                        const wallGeo = new THREE.BoxGeometry(0.9, wallHeight, 0.08);
                        const wall = new THREE.Mesh(wallGeo, wallMat);
                        wall.position.set(0, wallHeight / 2 + 0.1, 0.42);
                        shelterObj.add(wall);
                      }
                      
                      console.log(`🔨 Shelter ${shelter.id} building: ${shelter.buildProgress}%`);
                    } else {
                      // Empty build plot - just a marked area (0.5m radius for 1m shelter)
                      const plotGeo = new THREE.CircleGeometry(0.5, 16);
                      const plotMat = new THREE.MeshStandardMaterial({
                        color: 0x8b7355, // Tan
                        metalness: 0.0,
                        roughness: 1.0,
                      });
                      const plot = new THREE.Mesh(plotGeo, plotMat);
                      plot.rotation.x = -Math.PI / 2;
                      plot.position.y = 0.02;
                      shelterObj.add(plot);
                    }
                  });
                }
              }
              if (msg.data.bots) {
                for (const botData of msg.data.bots) {
                  if (botsRef.current.has(botData.botId)) {
                    const entity = botsRef.current.get(botData.botId)!;
                    entity.targetPos.set(botData.x, (botData.height || 1.0) / 2, botData.z);
                    entity.data = botData;
                    
                    // Update selectedBotInfo if this is the selected bot (for live needs updates)
                    setSelectedBotInfo(prev => {
                      if (prev && prev.botId === botData.botId) {
                        return {
                          ...prev,
                          state: botData.state,
                          needs: botData.needs,
                          inventory: botData.inventory,
                        };
                      }
                      return prev;
                    });
                  } else {
                    createBot(botData);
                  }
                }
                
                // Check if any bot is eating - shrink corn field
                const anyBotEating = msg.data.bots.some((b: { state: string }) => b.state === 'eating');
                if (anyBotEating) {
                  cornTargetScaleRef.current = 0.2; // Shrink to 20%
                } else if (cornInitializedRef.current) {
                  cornTargetScaleRef.current = 1; // Grow back to full size
                }
              }
              break;

            case 'bot:speak': {
              showSpeechBubble(msg.data.botId, msg.data.title);
              const bot = botsRef.current.get(msg.data.botId);
              const activityMsg: ActivityMessage = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                postId: msg.data.postId || undefined,
                botName: msg.data.botName,
                botColor: bot?.data.color || '#888',
                text: msg.data.title || msg.data.content?.substring(0, 80),
                content: msg.data.content || '',
                time: new Date().toLocaleTimeString(),
              };
              
              // Update bot's post count and recent post
              if (bot) {
                bot.postCount += 1;
                bot.recentPost = activityMsg;
                const visual = BOT_VISUALS[bot.data.personality] || BOT_VISUALS.tech;
                bot.label.innerHTML = `${visual.emoji} ${bot.data.botName} <span style="opacity:0.7;font-size:0.8em">💡${bot.postCount}</span>`;
              }
              
              activityRef.current(prev => {
                const next = [activityMsg, ...prev];
                return next.slice(0, 50);
              });
              break;
            }
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        console.log('🔌 Disconnected — retrying...');
        if (statusRef.current) {
          statusRef.current.textContent = '🔴 Disconnected — retrying...';
          statusRef.current.style.color = '#f87171';
        }
        reconnectTimer = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = () => {
        if (disposed) return;
        if (statusRef.current) {
          statusRef.current.textContent = '🔴 Connection error';
          statusRef.current.style.color = '#f87171';
        }
      };
    }

    connectWebSocket();

    // ─── Cleanup ───────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      // Dispose Three.js resources to prevent GPU memory leaks
      // Copy ref to local variable for cleanup (React hooks best practice)
      const botsToCleanup = botsRef.current;
      for (const entity of botsToCleanup.values()) {
        entity.mesh.geometry.dispose();
        const material = entity.mesh.material;
        if (Array.isArray(material)) {
          material.forEach(m => m.dispose());
        } else {
          material.dispose();
        }
        entity.label.remove();
        entity.speechBubble.remove();
      }
      botsToCleanup.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a1a' }}>
      {/* Status Bar */}
      <StatusBar
        currentTime={currentTime}
        location={location}
        weather={weather}
        selectedBotInfo={selectedBotInfo}
        showAirQuality={showAirQuality}
        setShowAirQuality={setShowAirQuality}
        showPhysicalNeeds={showPhysicalNeeds}
        setShowPhysicalNeeds={setShowPhysicalNeeds}
        statusRef={statusRef}
        onReset={handleReset}
      />

      {/* Activity Feed Panel */}
      <ActivityFeedPanel
        uiTheme={uiTheme}
        activityFeed={activityFeed}
        selectedPost={selectedPost}
        selectPost={selectPost}
        showFeed={showFeed}
        setShowFeed={setShowFeed}
        feedRef={feedRef}
      />

      {/* Bot Metrics Panel */}
      {selectedBotInfo && (
        <BotMetricsPanel
          uiTheme={uiTheme}
          selectedBotInfo={selectedBotInfo}
          showFeed={showFeed}
          onClose={() => setSelectedBotInfo(null)}
        />
      )}

      {/* Air Quality Panel */}
      {showAirQuality && weather?.airQuality && (
        <AirQualityPanel
          uiTheme={uiTheme}
          airQuality={weather.airQuality}
          onClose={() => setShowAirQuality(false)}
        />
      )}

      {/* Physical Needs Panel */}
      {showPhysicalNeeds && selectedBotInfo?.needs && (
        <PhysicalNeedsPanel
          uiTheme={uiTheme}
          selectedBotInfo={selectedBotInfo}
          needs={selectedBotInfo.needs}
          showAirQuality={showAirQuality}
          hasAirQuality={!!weather?.airQuality}
          onClose={() => setShowPhysicalNeeds(false)}
        />
      )}

      {/* Post Detail Panel */}
      {selectedPost && (
        <PostDetailPanel
          uiTheme={uiTheme}
          selectedPost={selectedPost}
          postDetail={postDetail}
          detailLoading={detailLoading}
          onClose={() => selectPost(null)}
        />
      )}

      {/* Bot Types Legend */}
      <div
        style={{
          position: 'absolute',
          top: '56px',
          left: '290px',
          background: 'rgba(10,10,26,0.85)',
          border: '1px solid rgba(74, 158, 255, 0.2)',
          borderRadius: '12px',
          padding: '12px 16px',
          zIndex: 10,
          fontFamily: "'Inter', system-ui, sans-serif",
          backdropFilter: 'blur(10px)',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
        }}
      >
        <div style={{ color: '#8888cc', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
          Bot Types
        </div>
        {Object.entries(BOT_VISUALS).map(([key, v]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: key === 'philo' ? '50%' : '2px',
                background: `#${v.color.toString(16).padStart(6, '0')}`,
              }}
            />
            <span style={{ color: '#ccc', fontSize: '12px' }}>
              {v.emoji} {v.label}
            </span>
          </div>
        ))}
      </div>

      {/* Controls hint */}
      {/* View Controls Instructions - positioned left of detail panel */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: selectedPost ? '360px' : '20px',
          background: 'rgba(10,10,26,0.85)',
          border: '1px solid rgba(74,158,255,0.2)',
          borderRadius: '12px',
          padding: '12px 16px',
          zIndex: 10,
          fontFamily: "'Inter', system-ui, sans-serif",
          backdropFilter: 'blur(10px)',
          color: '#666',
          fontSize: '11px',
          lineHeight: '1.6',
          transition: 'right 0.2s ease',
        }}
      >
        <span style={{ color: '#888' }}>🖱️ Drag</span> rotate &nbsp;·&nbsp;
        <span style={{ color: '#888' }}>⚙️ Scroll</span> zoom &nbsp;·&nbsp;
        <span style={{ color: '#888' }}>Right-Drag</span> pan &nbsp;·&nbsp;
        <span style={{ color: '#888' }}>Click</span> bot
      </div>

      {/* Labels container */}
      <div
        ref={labelsRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}
      />

      {/* Three.js canvas container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <style>{`
        .bot-label {
          position: absolute;
          top: 0;
          left: 0;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: #e0e0ff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
          white-space: nowrap;
          pointer-events: none;
          transition: opacity 0.2s;
        }
        .speech-bubble {
          position: absolute;
          top: 0;
          left: 0;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 11px;
          color: #fff;
          background: rgba(74, 158, 255, 0.15);
          border: 1px solid rgba(74, 158, 255, 0.4);
          border-radius: 8px;
          padding: 6px 12px;
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          backdrop-filter: blur(6px);
          animation: fadeInBubble 0.3s ease;
        }
        @keyframes fadeInBubble {
          from { opacity: 0; transform: translate(-50%, -80%); }
          to { opacity: 1; transform: translate(-50%, -100%); }
        }
        @keyframes fadeInMsg {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .activity-scroll::-webkit-scrollbar { width: 4px; }
        .activity-scroll::-webkit-scrollbar-track { background: transparent; }
        .activity-scroll::-webkit-scrollbar-thumb { background: rgba(74,158,255,0.2); border-radius: 2px; }
      `}</style>
    </div>
  );
}
