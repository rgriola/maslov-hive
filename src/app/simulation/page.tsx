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
import { getPersonalityMeta, createBotGeometry } from '@/config/bot-visuals';

// Hooks
import { useWeather } from '@/hooks/useWeather';

// Scene object factories
import {
  createWaterSpot,
  createCornField,
  createForest,
  createQuarry,
  createSundial,
  buildShelterMesh,
  disposeObject3D,
} from '@/lib/scene-objects';

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
  const weather = useWeather({ location });
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
  const sheltersRef = useRef<Map<string, THREE.Group>>(new Map()); // Bot shelters
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

  // Weather data is now fetched via the useWeather hook above

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
    fetch('/api/v1/posts?limit=25')
      .then(res => res.json())
      .then(data => {
        const posts = data.data?.posts || data.posts || [];
        const messages: ActivityMessage[] = posts.map((p: { id: string; agent: { name: string }; title: string; content: string; createdAt: string }) => {
          // Try to get the bot's actual mesh color from the simulation
          const botEntity = botsRef.current.get(
            [...botsRef.current.entries()].find(([, e]) => e.data.botName === p.agent.name)?.[0] || ''
          );
          return {
            id: p.id,
            postId: p.id,
            botName: p.agent.name,
            botColor: botEntity?.data.color || '#888',
            text: p.title || p.content.substring(0, 80),
            content: p.content,
            time: new Date(p.createdAt).toLocaleTimeString(),
          };
        });
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
      disposeObject3D(obj);
    });
    foodSpotsRef.current = [];
    cornInitializedRef.current = false;
    cornTargetScaleRef.current = 1;

    // Clear wood/stone/shelters so they can be recreated
    woodSpotsRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      disposeObject3D(obj);
    });
    woodSpotsRef.current = [];
    woodInitializedRef.current = false;

    stoneSpotsRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      disposeObject3D(obj);
    });
    stoneSpotsRef.current = [];
    stoneInitializedRef.current = false;

    sheltersRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      disposeObject3D(obj);
    });
    sheltersRef.current.clear();

    // Remove sundial if it exists
    if (sundialRef.current && sceneRef.current) {
      sceneRef.current.remove(sundialRef.current);
      disposeObject3D(sundialRef.current);
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

    const meta = getPersonalityMeta(data.personality);

    // Use server-provided random dimensions, fallback to defaults
    const w = data.width || 0.65;
    const h = data.height || 1.0;
    const botColor = data.color
      ? new THREE.Color(data.color)
      : new THREE.Color(0x4a9eff);
    const emissiveColor = botColor.clone().multiplyScalar(0.3);

    // Create group
    const group = new THREE.Group();
    group.position.set(data.x, h / 2, data.z);

    // Main mesh — use server-assigned random geometry type
    const geometry = createBotGeometry(data.shape, w, h);
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
    label.innerHTML = `${meta.emoji} ${data.botName}`;
    labelsContainer.appendChild(label);

    // Speech bubble
    const speechBubble = document.createElement('div');
    speechBubble.className = 'speech-bubble';
    speechBubble.style.display = 'none';
    labelsContainer.appendChild(speechBubble);

    // Urgent need emoji label
    const urgentNeedLabel = document.createElement('div');
    urgentNeedLabel.className = 'urgent-need-label';
    urgentNeedLabel.style.display = 'none';
    labelsContainer.appendChild(urgentNeedLabel);

    // Store botId on mesh for raycasting click detection
    mesh.userData = { botId: data.botId };

    const entity: BotEntity = {
      group,
      mesh,
      label,
      speechBubble,
      urgentNeedLabel,
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

          // Urgent need emoji floats above the label
          if (entity.data.urgentNeed) {
            entity.urgentNeedLabel.textContent = entity.data.urgentNeed;
            entity.urgentNeedLabel.style.display = 'block';
            entity.urgentNeedLabel.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 24}px)`;
          } else {
            entity.urgentNeedLabel.style.display = 'none';
          }
        } else {
          entity.label.style.display = 'none';
          entity.speechBubble.style.display = 'none';
          entity.urgentNeedLabel.style.display = 'none';
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
            const meta = getPersonalityMeta(entity.data.personality);
            setSelectedBotInfo({
              botId: entity.data.botId,
              botName: entity.data.botName,
              personality: entity.data.personality,
              postCount: entity.postCount,
              color: entity.data.color || '#888',
              state: entity.data.state,
              height: entity.data.height,
              lastPostTime: entity.recentPost?.time,
              needs: entity.data.needs,
              urgentNeed: entity.data.urgentNeed,
              awareness: entity.data.awareness,
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
                  waterSpotsRef.current.forEach(mesh => { scene.remove(mesh); disposeObject3D(mesh); });
                  waterSpotsRef.current = [];
                  msg.data.worldConfig.waterSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const waterMesh = createWaterSpot(spot);
                    scene.add(waterMesh);
                    waterSpotsRef.current.push(waterMesh);
                  });
                }

                // Render food spots for bot survival (only create once)
                if (msg.data.worldConfig.foodSpots && !cornInitializedRef.current) {
                  cornInitializedRef.current = true;
                  msg.data.worldConfig.foodSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const cornGroup = createCornField(spot);
                    scene.add(cornGroup);
                    foodSpotsRef.current.push(cornGroup);
                  });
                  cornTargetScaleRef.current = 1;
                }

                // Render wood spots (forest with trees) - only create once
                if (msg.data.worldConfig.woodSpots && !woodInitializedRef.current) {
                  woodInitializedRef.current = true;
                  msg.data.worldConfig.woodSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const forestGroup = createForest(spot);
                    scene.add(forestGroup);
                    woodSpotsRef.current.push(forestGroup);
                  });
                }

                // Render stone spots (quarry with rocks) - only create once
                if (msg.data.worldConfig.stoneSpots && !stoneInitializedRef.current) {
                  stoneInitializedRef.current = true;
                  msg.data.worldConfig.stoneSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const quarryGroup = createQuarry(spot);
                    scene.add(quarryGroup);
                    stoneSpotsRef.current.push(quarryGroup);
                  });
                }

                // Render sundial (community time-keeping structure) - only create once
                if (msg.data.worldConfig.sundial && !sundialInitializedRef.current) {
                  sundialInitializedRef.current = true;
                  const sundialGroup = createSundial(msg.data.worldConfig.sundial);
                  scene.add(sundialGroup);
                  sundialRef.current = sundialGroup;
                }

                // Render shelters (huts) - dynamic, update on each tick
                if (msg.data.worldConfig.shelters) {
                  interface ShelterData {
                    id: string;
                    type: string;
                    x: number;
                    z: number;
                    built: boolean;
                    buildProgress: number;
                    ownerId: string | null;
                  }
                  msg.data.worldConfig.shelters.forEach((shelter: ShelterData) => {
                    let shelterObj = sheltersRef.current.get(shelter.id);
                    if (!shelterObj) {
                      shelterObj = new THREE.Group();
                      shelterObj.position.set(shelter.x, 0, shelter.z);
                      sheltersRef.current.set(shelter.id, shelterObj);
                      scene.add(shelterObj);
                    }
                    buildShelterMesh(shelter, shelterObj);
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
                          urgentNeed: botData.urgentNeed,
                          awareness: botData.awareness,
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
                const meta = getPersonalityMeta(bot.data.personality);
                bot.label.innerHTML = `${meta.emoji} ${bot.data.botName} <span style="opacity:0.7;font-size:0.8em">💡${bot.postCount}</span>`;
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
        entity.urgentNeedLabel.remove();
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
        {Object.entries(
          { tech: getPersonalityMeta('tech'), philo: getPersonalityMeta('philo'), art: getPersonalityMeta('art'), science: getPersonalityMeta('science'), pirate: getPersonalityMeta('pirate') }
        ).map(([key, meta]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#ccc', fontSize: '12px' }}>
              {meta.emoji} {meta.label}
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
        .urgent-need-label {
          position: absolute;
          top: 0;
          left: 0;
          font-size: 22px;
          pointer-events: none;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
          animation: urgentPulse 1.2s ease-in-out infinite;
          z-index: 6;
        }
        @keyframes urgentPulse {
          0%, 100% { transform: translate(-50%, -100%) scale(1); }
          50% { transform: translate(-50%, -100%) scale(1.3); }
        }
        .activity-scroll::-webkit-scrollbar { width: 4px; }
        .activity-scroll::-webkit-scrollbar-track { background: transparent; }
        .activity-scroll::-webkit-scrollbar-thumb { background: rgba(74,158,255,0.2); border-radius: 2px; }
      `}</style>
    </div>
  );
}
