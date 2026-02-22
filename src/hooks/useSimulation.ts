/**
 * useSimulation — core simulation hook managing Three.js scene, WebSocket,
 * animation loop, bot entities, and all associated state.
 * Extracted from simulation/page.tsx (~1250 lines) to reduce page to ~320 lines.
 * Refactored: 2026-02-21 — Phase 4 hook extraction
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type {
  BotData,
  ActivityMessage,
  SelectedBotInfo,
  PostDetail,
  ShelterData,
  WeatherData,
} from '@/types/simulation';
import type { BotEntity } from '@/types/scene';

import { calculateSunPosition } from '@/utils/solar';
import { getPersonalityMeta, createBotGeometry } from '@/config/bot-visuals';
import {
  DEFAULT_LOCATION,
  WORLD_CONFIG,
  SCENE_CONFIG,
  WS_DEFAULT_URL,
  WS_RECONNECT_MS,
  SPEECH_BUBBLE_MS,
  FEED_MAX_ITEMS,
} from '@/config/simulation';
import {
  GROUND_COLOR,
  GRID_LINE_COLOR,
  GRID_CENTER_COLOR,
  SKY_BLUE,
  AMBIENT_NIGHT,
  MOONLIGHT,
  ACCENT_BLUE_3D,
  ACCENT_PURPLE_3D,
  CLOUD_GRAY,
} from '@/config/scene-colors';
import {
  createWaterSpot,
  createCornField,
  createForest,
  createQuarry,
  createSundial,
} from '@/lib/scene-objects';
import { buildShelterMesh } from '@/lib/shelter-mesh';
import { disposeObject3D } from '@/lib/three-utils';

// ─── Interface ──────────────────────────────────────────────────

export interface UseSimulationParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  labelsRef: React.RefObject<HTMLDivElement | null>;
  currentTime: Date | null;
  location: { lat: number; lng: number } | null;
  weather: WeatherData | null;
  showAllBots: boolean;
}

export interface UseSimulationReturn {
  // Refs for JSX bindings
  statusRef: React.RefObject<HTMLDivElement | null>;
  feedRef: React.RefObject<HTMLDivElement | null>;
  botsRef: React.RefObject<Map<string, BotEntity>>;

  // Reactive state
  wsConnected: boolean;
  activityFeed: ActivityMessage[];
  selectedPost: ActivityMessage | null;
  postDetail: PostDetail | null;
  detailLoading: boolean;
  selectedBotInfo: SelectedBotInfo | null;
  setSelectedBotInfo: React.Dispatch<React.SetStateAction<SelectedBotInfo | null>>;
  allBotsData: BotData[];
  simSpeed: number;

  // Actions
  selectPost: (msg: ActivityMessage | null) => void;
  setSpeed: (speed: number) => void;
  fullReset: () => void;
  handleReset: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────

export function useSimulation({
  containerRef,
  labelsRef,
  currentTime,
  location,
  weather,
  showAllBots,
}: UseSimulationParams): UseSimulationReturn {
  // ─── Three.js Refs ──────────────────────────────────────────
  const botsRef = useRef<Map<string, BotEntity>>(new Map());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const moonLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const feedRef = useRef<HTMLDivElement>(null);
  const rainParticlesRef = useRef<THREE.Points | null>(null);
  const cloudParticlesRef = useRef<THREE.Points | null>(null);
  const waterSpotsRef = useRef<THREE.Mesh[]>([]);
  const foodSpotsRef = useRef<THREE.Object3D[]>([]);
  const foodScaleTargetsRef = useRef<number[]>([]);
  const cornInitializedRef = useRef<boolean>(false);
  const woodSpotsRef = useRef<THREE.Object3D[]>([]);
  const woodScaleTargetsRef = useRef<number[]>([]);
  const stoneSpotsRef = useRef<THREE.Object3D[]>([]);
  const sheltersRef = useRef<Map<string, THREE.Group>>(new Map());
  const sundialRef = useRef<THREE.Object3D | null>(null);
  const woodInitializedRef = useRef<boolean>(false);
  const stoneInitializedRef = useRef<boolean>(false);
  const sundialInitializedRef = useRef<boolean>(false);

  // ─── State ──────────────────────────────────────────────────
  const [activityFeed, setActivityFeed] = useState<ActivityMessage[]>([]);
  const activityRef = useRef(setActivityFeed);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ActivityMessage | null>(null);
  const [postDetail, setPostDetail] = useState<PostDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedBotInfo, setSelectedBotInfo] = useState<SelectedBotInfo | null>(null);
  const [allBotsData, setAllBotsData] = useState<BotData[]>([]);
  const [simSpeed, setSimSpeed] = useState(1);

  // ─── Simulation Controls ────────────────────────────────────

  const setSpeed = useCallback((speed: number) => {
    setSimSpeed(speed);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'sim:speed', data: { speed } }));
    }
  }, []);

  const fullReset = useCallback(() => {
    if (confirm('🚨 Are you sure? This will WIPE ALL DATA and restart the simulation!')) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'sim:reset' }));
      }
    }
  }, []);

  // ─── Speed Toggle (Dev Only) ────────────────────────────────
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'q') {
        setSimSpeed(current => {
          const next = current === 1 ? 2 : current === 2 ? 4 : 1;
          setSpeed(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSpeed]);

  // ─── Select Post & Fetch Details ────────────────────────────

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

  // ─── Load Recent Posts on Mount ─────────────────────────────

  useEffect(() => {
    fetch('/api/v1/posts?limit=25')
      .then(res => res.json())
      .then(data => {
        const posts = data.data?.posts || data.posts || [];
        const messages: ActivityMessage[] = posts.map((p: { id: string; agent: { name: string }; title: string; content: string; createdAt: string }) => {
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

  // ─── Reset Handlers ─────────────────────────────────────────

  const handleReset = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(15, 20, 15);
      cameraRef.current.lookAt(0, 0, 0);
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    for (const entity of botsRef.current.values()) {
      if (sceneRef.current) sceneRef.current.remove(entity.group);
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
    botsRef.current.clear();

    foodSpotsRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      disposeObject3D(obj);
    });
    foodSpotsRef.current = [];
    foodScaleTargetsRef.current = [];
    cornInitializedRef.current = false;

    woodSpotsRef.current.forEach(obj => {
      if (sceneRef.current) sceneRef.current.remove(obj);
      disposeObject3D(obj);
    });
    woodSpotsRef.current = [];
    woodScaleTargetsRef.current = [];
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

    if (sundialRef.current && sceneRef.current) {
      sceneRef.current.remove(sundialRef.current);
      disposeObject3D(sundialRef.current);
      sundialRef.current = null;
    }
    sundialInitializedRef.current = false;

    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  const onSimResetComplete = useCallback(() => {
    console.log('🔄 Simulation reset acknowledged by bridge. Cleaning local state...');
    handleReset();
  }, [handleReset]);

  // ─── Dynamic Ground Sizing ──────────────────────────────────

  const calculateGroundSize = useCallback((botCount: number): number => {
    const area = Math.max(1, botCount) * WORLD_CONFIG.SQ_METERS_PER_BOT;
    const size = Math.sqrt(area);
    return Math.max(WORLD_CONFIG.MIN_GROUND_SIZE, Math.round(size));
  }, []);

  const resizeGroundForBots = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !groundRef.current || !gridRef.current) return;

    const botCount = botsRef.current.size;
    const size = calculateGroundSize(botCount);

    const currentSize = (groundRef.current.geometry as THREE.PlaneGeometry).parameters.width;
    if (Math.abs(currentSize - size) < 2) return;

    groundRef.current.geometry.dispose();
    groundRef.current.geometry = new THREE.PlaneGeometry(size, size);

    scene.remove(gridRef.current);
    gridRef.current.geometry.dispose();
    gridRef.current.material.dispose();
    const newGrid = new THREE.GridHelper(size, Math.round(size), GRID_LINE_COLOR, GRID_CENTER_COLOR);
    newGrid.position.y = 0.01;
    scene.add(newGrid);
    gridRef.current = newGrid;

    console.log(`[Simulation] Resized ground to ${size}x${size} for ${botCount} bots`);
  }, [calculateGroundSize]);

  // ─── Create Bot 3D Entity ───────────────────────────────────

  const createBot = useCallback((data: BotData) => {
    const scene = sceneRef.current;
    const labelsContainer = labelsRef.current;
    if (!scene || !labelsContainer) return;

    if (botsRef.current.has(data.botId)) {
      const entity = botsRef.current.get(data.botId)!;
      entity.targetPos.set(data.x, (data.height || 1.0) / 2, data.z);
      entity.data = data;
      return;
    }

    const meta = getPersonalityMeta(data.personality);
    const w = data.width || 0.65;
    const h = data.height || 1.0;
    const botColor = data.color
      ? new THREE.Color(data.color)
      : new THREE.Color(ACCENT_BLUE_3D);
    const emissiveColor = botColor.clone().multiplyScalar(0.3);

    const group = new THREE.Group();
    group.position.set(data.x, h / 2, data.z);

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

    const label = document.createElement('div');
    label.className = 'bot-label';
    label.innerHTML = `${meta.emoji} ${data.botName}`;
    labelsContainer.appendChild(label);

    const speechBubble = document.createElement('div');
    speechBubble.className = 'speech-bubble';
    speechBubble.style.display = 'none';
    labelsContainer.appendChild(speechBubble);

    const urgentNeedLabel = document.createElement('div');
    urgentNeedLabel.className = 'urgent-need-label';
    urgentNeedLabel.style.display = 'none';
    labelsContainer.appendChild(urgentNeedLabel);

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
    resizeGroundForBots();
  }, [labelsRef, resizeGroundForBots]);

  // ─── Show Speech Bubble ─────────────────────────────────────

  const showSpeechBubble = useCallback((botId: string, title: string) => {
    const entity = botsRef.current.get(botId);
    if (!entity) return;
    entity.speechBubble.textContent = title;
    entity.speechBubble.style.display = 'block';
    setTimeout(() => {
      entity.speechBubble.style.display = 'none';
    }, SPEECH_BUBBLE_MS);
  }, []);

  // ─── Weather Visual Effects ─────────────────────────────────

  useEffect(() => {
    const rain = rainParticlesRef.current;
    const snow = cloudParticlesRef.current;

    if (rain) {
      rain.visible = weather?.isRaining ?? false;
      if (rain.material instanceof THREE.PointsMaterial && weather?.isRaining) {
        const intensity = weather.precipitation > 5 ? 0.8 : weather.precipitation > 1 ? 0.6 : 0.4;
        rain.material.opacity = intensity;
      }
    }

    if (snow) {
      snow.visible = weather?.isSnowing ?? false;
    }

    const scene = sceneRef.current;
    if (scene && scene.fog instanceof THREE.FogExp2) {
      if (weather?.isFoggy) {
        scene.fog.density = 0.035;
      } else if (weather?.isRaining || weather?.isCloudy) {
        scene.fog.density = 0.018;
      } else {
        scene.fog.density = 0.012;
      }
    }
  }, [weather]);

  // ─── Dynamic Lighting Update ────────────────────────────────

  useEffect(() => {
    if (!sceneRef.current || !sunLightRef.current || !ambientLightRef.current || !currentTime) return;

    const lat = location?.lat ?? DEFAULT_LOCATION.lat;
    const lng = location?.lng ?? DEFAULT_LOCATION.lng;
    const { altitude, azimuth } = calculateSunPosition(currentTime, lat, lng);

    const sunRadius = SCENE_CONFIG.SUN_RADIUS;
    const sunX = sunRadius * Math.cos(altitude) * Math.sin(azimuth);
    const sunY = sunRadius * Math.sin(altitude);
    const sunZ = sunRadius * Math.cos(altitude) * Math.cos(azimuth);

    const sunLight = sunLightRef.current;
    const moonLight = moonLightRef.current;
    const ambientLight = ambientLightRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;

    const normalizedAlt = (altitude + Math.PI / 2) / Math.PI;
    const sunUp = altitude > 0;

    if (sunUp) {
      sunLight.position.set(sunX, Math.max(sunY, 2), sunZ);
      sunLight.visible = true;
      if (moonLight) moonLight.visible = false;

      const horizonFactor = Math.max(0, 1 - altitude / (Math.PI / 4));
      const sunColor = new THREE.Color().setHSL(
        0.08 - horizonFactor * 0.06,
        0.4 + horizonFactor * 0.5,
        0.9 - horizonFactor * 0.3
      );
      sunLight.color = sunColor;
      sunLight.intensity = 0.8 + normalizedAlt * 0.8;

      ambientLight.color.setHSL(0.6, 0.2, 0.4 + normalizedAlt * 0.2);
      ambientLight.intensity = 0.6 + normalizedAlt * 0.4;

      if (renderer && scene) {
        const skyHue = horizonFactor > 0.5 ? 0.05 : 0.6;
        const skySat = horizonFactor > 0.5 ? 0.6 : 0.3;
        const skyLight = 0.15 + (1 - horizonFactor) * 0.25;
        scene.background = new THREE.Color().setHSL(skyHue, skySat, skyLight);
      }
    } else {
      sunLight.visible = false;
      if (moonLight) {
        moonLight.position.set(-sunX, Math.max(-sunY, 5), -sunZ);
        moonLight.visible = true;
        moonLight.intensity = 0.3;
        moonLight.color.setHSL(0.6, 0.1, 0.9);
      }

      const nightDepth = Math.min(1, -altitude / (Math.PI / 6));
      ambientLight.color.setHSL(0.65, 0.4, 0.15);
      ambientLight.intensity = 0.15 + (1 - nightDepth) * 0.2;

      if (renderer && scene) {
        scene.background = new THREE.Color().setHSL(0.65, 0.5, 0.02 + (1 - nightDepth) * 0.08);
      }
    }

    sunLight.shadow.camera.updateProjectionMatrix();
  }, [currentTime, location]);

  // ─── Data Sync for All Bots Panel ───────────────────────────

  useEffect(() => {
    if (!showAllBots) return;
    const syncTimer = setInterval(() => {
      const bots = Array.from(botsRef.current.values()).map(entity => entity.data);
      setAllBotsData(bots);
    }, 1000);
    return () => clearInterval(syncTimer);
  }, [showAllBots]);

  // ─── Main Setup (Scene, Animation, WebSocket) ───────────────

  useEffect(() => {
    const container = containerRef.current;
    const labelsContainer = labelsRef.current;
    if (!container || !labelsContainer) return;

    // ─── Scene ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY_BLUE);
    scene.fog = new THREE.FogExp2(SKY_BLUE, 0.012);
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

    // ─── Raycaster ─────────────────────────────────────
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

    // ─── Ground ────────────────────────────────────────
    const defaultSize = SCENE_CONFIG.INITIAL_GROUND_SIZE;
    const groundGeo = new THREE.PlaneGeometry(defaultSize, defaultSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: GROUND_COLOR,
      metalness: 0.05,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    const grid = new THREE.GridHelper(defaultSize, defaultSize, GRID_LINE_COLOR, GRID_CENTER_COLOR);
    grid.position.y = 0.01;
    scene.add(grid);
    gridRef.current = grid;

    // ─── Lighting ──────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(AMBIENT_NIGHT, 0.8);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

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

    const moonLight = new THREE.DirectionalLight(MOONLIGHT, 0.3);
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
    moonLight.visible = false;
    scene.add(moonLight);
    moonLightRef.current = moonLight;

    const pointLight1 = new THREE.PointLight(ACCENT_BLUE_3D, 0.5, 30);
    pointLight1.position.set(-10, 5, -10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(ACCENT_PURPLE_3D, 0.5, 30);
    pointLight2.position.set(10, 5, 10);
    scene.add(pointLight2);

    // ─── Weather Particles ─────────────────────────────
    const rainCount = 3000;
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    const rainVelocities = new Float32Array(rainCount);

    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 60;
      rainPositions[i * 3 + 1] = Math.random() * 30;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      rainVelocities[i] = 0.3 + Math.random() * 0.4;
    }

    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(rainVelocities, 1));

    const rainMaterial = new THREE.PointsMaterial({
      color: CLOUD_GRAY,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    const rainParticles = new THREE.Points(rainGeometry, rainMaterial);
    rainParticles.visible = false;
    scene.add(rainParticles);
    rainParticlesRef.current = rainParticles;

    const snowCount = 2000;
    const snowGeometry = new THREE.BufferGeometry();
    const snowPositions = new Float32Array(snowCount * 3);
    const snowDrifts = new Float32Array(snowCount);

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
    cloudParticlesRef.current = snowParticles;

    // ─── Animation Loop ────────────────────────────────
    const clock = new THREE.Clock();
    let rafId: number;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      controls.update();

      // Bot entity updates
      for (const entity of botsRef.current.values()) {
        entity.group.position.lerp(entity.targetPos, 0.08);
        entity.mesh.position.y = Math.sin(elapsed * 2 + entity.group.position.x) * 0.05;
        entity.mesh.rotation.y += delta * 0.3;

        const pos = entity.group.position.clone();
        pos.y += 1.5;
        pos.project(camera);

        const x = (pos.x * 0.5 + 0.5) * container!.clientWidth;
        const y = (-pos.y * 0.5 + 0.5) * container!.clientHeight;

        if (pos.z < 1 && !entity.data.isInside && entity.label.parentElement) {
          entity.label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
          entity.label.style.display = 'block';
          entity.speechBubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 30}px)`;

          if (entity.data.urgentNeed) {
            entity.urgentNeedLabel.textContent = entity.data.urgentNeed;
            entity.urgentNeedLabel.style.display = 'block';
            entity.urgentNeedLabel.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 24}px)`;
          } else {
            entity.urgentNeedLabel.style.display = 'none';
          }
        } else if (entity.label.parentElement) {
          entity.label.style.display = 'none';
          entity.speechBubble.style.display = 'none';
          entity.urgentNeedLabel.style.display = 'none';
        }

        // Glow ring pulse
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

      // Rain animation
      if (rainParticles.visible) {
        const positions = rainGeometry.attributes.position.array as Float32Array;
        const velocities = rainGeometry.attributes.velocity.array as Float32Array;
        for (let i = 0; i < rainCount; i++) {
          positions[i * 3 + 1] -= velocities[i];
          if (positions[i * 3 + 1] < 0) {
            positions[i * 3 + 1] = 25 + Math.random() * 5;
            positions[i * 3] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
          }
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }

      // Snow animation
      if (snowParticles.visible) {
        const positions = snowGeometry.attributes.position.array as Float32Array;
        const drifts = snowGeometry.attributes.drift.array as Float32Array;
        for (let i = 0; i < snowCount; i++) {
          positions[i * 3 + 1] -= 0.03;
          positions[i * 3] += drifts[i] + Math.sin(elapsed + i) * 0.005;
          positions[i * 3 + 2] += Math.cos(elapsed * 0.7 + i) * 0.003;
          if (positions[i * 3 + 1] < 0) {
            positions[i * 3 + 1] = 20 + Math.random() * 5;
            positions[i * 3] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
          }
        }
        snowGeometry.attributes.position.needsUpdate = true;
      }

      // Corn field (food) scaling animation — shrinks as food is consumed, grows for new spots
      for (let i = 0; i < foodSpotsRef.current.length; i++) {
        const cornGroup = foodSpotsRef.current[i];
        const target = foodScaleTargetsRef.current[i] ?? 1;
        const current = cornGroup.scale.x;
        if (Math.abs(current - target) > 0.005) {
          const newScale = current + (target - current) * 0.03;
          cornGroup.scale.set(newScale, newScale, newScale);
        }
      }

      // Forest (wood) scaling animation — shrinks as wood is taken, grows for new spots
      for (let i = 0; i < woodSpotsRef.current.length; i++) {
        const forestGroup = woodSpotsRef.current[i];
        const target = woodScaleTargetsRef.current[i] ?? 1;
        const current = forestGroup.scale.x;
        if (Math.abs(current - target) > 0.005) {
          const newScale = current + (target - current) * 0.03;
          forestGroup.scale.set(newScale, newScale, newScale);
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

    // ─── Click Handler ─────────────────────────────────
    function onCanvasClick(event: MouseEvent) {
      if (!raycasterRef.current || !cameraRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const botMeshes: THREE.Mesh[] = [];
      for (const entity of botsRef.current.values()) {
        botMeshes.push(entity.mesh);
      }

      const intersects = raycasterRef.current.intersectObjects(botMeshes, false);

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh;
        const botId = clickedMesh.userData.botId;

        if (botId) {
          const entity = botsRef.current.get(botId);

          if (entity) {
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
              lifetimeStats: entity.data.lifetimeStats,
              spawnDate: entity.data.spawnDate,
            });
          }

          if (entity && entity.recentPost) {
            entity.speechBubble.textContent = entity.recentPost.text;
            entity.speechBubble.style.display = 'block';
            setTimeout(() => {
              entity.speechBubble.style.display = 'none';
            }, SPEECH_BUBBLE_MS);
            selectPost(entity.recentPost);
          } else if (entity) {
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
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || WS_DEFAULT_URL;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        console.log('🔌 Connected to simulation bridge');
        setWsConnected(true);
        if (statusRef.current) {
          statusRef.current.textContent = '🟢 Broadcasting 5x5';
          statusRef.current.style.color = '#4ade80';
        }
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.type !== 'world:update') {
            console.log(`[WS] Received message: ${msg.type}`, msg.data);
          }

          switch (msg.type) {
            case 'world:init':
              console.log('[WS] World initialization data received', {
                botCount: msg.data.bots?.length,
                shelterCount: msg.data.worldConfig?.shelters?.length,
                worldRadius: msg.data.worldConfig?.groundRadius
              });
            // ⚠️ Intentional fallthrough — world:init carries same structure as world:update
            // eslint-disable-next-line no-fallthrough
            case 'world:update':
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
                  const newGrid = new THREE.GridHelper(diameter, Math.round(diameter), GRID_LINE_COLOR, GRID_CENTER_COLOR);
                  newGrid.position.y = 0.01;
                  scene.add(newGrid);
                  gridRef.current = newGrid;
                }

                if (msg.data.worldConfig.waterSpots) {
                  waterSpotsRef.current.forEach(mesh => { scene.remove(mesh); disposeObject3D(mesh); });
                  waterSpotsRef.current = [];
                  msg.data.worldConfig.waterSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const waterMesh = createWaterSpot(spot);
                    scene.add(waterMesh);
                    waterSpotsRef.current.push(waterMesh);
                  });
                }

                if (msg.data.worldConfig.foodSpots) {
                  const serverFoodSpots: Array<{ x: number; z: number; radius: number; available: number; maxAvailable: number }> = msg.data.worldConfig.foodSpots;

                  // Remove excess visuals if server has fewer spots (old depleted spots removed)
                  while (foodSpotsRef.current.length > serverFoodSpots.length) {
                    const removed = foodSpotsRef.current.pop()!;
                    scene.remove(removed);
                    foodScaleTargetsRef.current.pop();
                  }

                  // Create visuals for any new food spots
                  while (foodSpotsRef.current.length < serverFoodSpots.length) {
                    const idx = foodSpotsRef.current.length;
                    const spot = serverFoodSpots[idx];
                    const cornGroup = createCornField(spot);
                    const initialScale = spot.maxAvailable > 0 ? spot.available / spot.maxAvailable : 0;
                    cornGroup.scale.set(initialScale, initialScale, initialScale);
                    scene.add(cornGroup);
                    foodSpotsRef.current.push(cornGroup);
                    foodScaleTargetsRef.current.push(initialScale);
                  }
                  cornInitializedRef.current = true;

                  // Update positions and scale targets for all spots
                  for (let i = 0; i < serverFoodSpots.length; i++) {
                    const spot = serverFoodSpots[i];
                    const obj = foodSpotsRef.current[i];
                    // Update position in case spot was replaced
                    if (obj && (Math.abs(obj.position.x - spot.x) > 0.1 || Math.abs(obj.position.z - spot.z) > 0.1)) {
                      scene.remove(obj);
                      const newCorn = createCornField(spot);
                      const s = spot.maxAvailable > 0 ? Math.max(0.01, spot.available / spot.maxAvailable) : 1;
                      newCorn.scale.set(s, s, s);
                      scene.add(newCorn);
                      foodSpotsRef.current[i] = newCorn;
                    }
                    const scale = spot.maxAvailable > 0 ? Math.max(0.05, spot.available / spot.maxAvailable) : 1;
                    foodScaleTargetsRef.current[i] = scale;
                  }
                }

                if (msg.data.worldConfig.woodSpots) {
                  const serverSpots: Array<{ x: number; z: number; radius: number; available: number; maxAvailable: number }> = msg.data.worldConfig.woodSpots;

                  // Create visuals for any new wood spots
                  while (woodSpotsRef.current.length < serverSpots.length) {
                    const idx = woodSpotsRef.current.length;
                    const spot = serverSpots[idx];
                    const forestGroup = createForest(spot);
                    // New growing spots start at scale 0
                    const initialScale = spot.available / spot.maxAvailable;
                    forestGroup.scale.set(initialScale, initialScale, initialScale);
                    scene.add(forestGroup);
                    woodSpotsRef.current.push(forestGroup);
                    woodScaleTargetsRef.current.push(initialScale);
                  }
                  woodInitializedRef.current = true;

                  // Update scale targets based on available wood
                  for (let i = 0; i < serverSpots.length; i++) {
                    const spot = serverSpots[i];
                    const scale = Math.max(0.05, spot.available / spot.maxAvailable);
                    woodScaleTargetsRef.current[i] = scale;
                  }
                }

                if (msg.data.worldConfig.stoneSpots && !stoneInitializedRef.current) {
                  stoneInitializedRef.current = true;
                  msg.data.worldConfig.stoneSpots.forEach((spot: { x: number; z: number; radius: number }) => {
                    const quarryGroup = createQuarry(spot);
                    scene.add(quarryGroup);
                    stoneSpotsRef.current.push(quarryGroup);
                  });
                }

                if (msg.data.worldConfig.sundial && !sundialInitializedRef.current) {
                  sundialInitializedRef.current = true;
                  const sundialGroup = createSundial(msg.data.worldConfig.sundial);
                  scene.add(sundialGroup);
                  sundialRef.current = sundialGroup;
                }

                if (msg.data.worldConfig.shelters) {
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

                    if (botData.isInside) {
                      entity.group.visible = false;
                      entity.label.style.display = 'none';
                      entity.urgentNeedLabel.style.display = 'none';
                      entity.speechBubble.style.display = 'none';
                    } else {
                      entity.group.visible = true;
                      entity.label.style.display = 'block';
                    }

                    setSelectedBotInfo(prev => {
                      if (prev && prev.botId === botData.botId) {
                        return {
                          ...prev,
                          state: botData.state,
                          needs: botData.needs,
                          urgentNeed: botData.urgentNeed,
                          awareness: botData.awareness,
                          inventory: botData.inventory,
                          lifetimeStats: botData.lifetimeStats,
                          spawnDate: botData.spawnDate,
                        };
                      }
                      return prev;
                    });
                  } else {
                    createBot(botData);
                  }
                }

                // Food scaling is now driven by available/maxAvailable in the foodSpots handler above
              }
              break;

            case 'sim:reset:complete':
              onSimResetComplete();
              break;

            case 'bot:speak': {
              showSpeechBubble(msg.data.botId, msg.data.title);
              const bot = botsRef.current.get(msg.data.botId);
              const activityMsg: ActivityMessage = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                postId: msg.data.postId || undefined,
                botName: msg.data.botName,
                botColor: msg.data.botColor || bot?.data.color || '#888',
                text: msg.data.title || msg.data.content?.substring(0, 80),
                content: msg.data.content || '',
                time: msg.data.time
                  ? new Date(msg.data.time).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                  : new Date().toLocaleTimeString(),
              };

              console.log(`[ActivityFeed] New post from ${activityMsg.botName}`, {
                id: activityMsg.id,
                postId: activityMsg.postId,
                color: activityMsg.botColor,
                timeReceived: new Date().toLocaleTimeString(),
                timeSent: msg.data.time ? new Date(msg.data.time).toLocaleTimeString() : 'N/A',
                latencyMs: msg.data.time ? Date.now() - new Date(msg.data.time).getTime() : 'N/A'
              });

              if (bot) {
                bot.postCount += 1;
                bot.recentPost = activityMsg;
                if (msg.data.lifetimeStats) {
                  bot.data.lifetimeStats = msg.data.lifetimeStats;
                }
                const meta = getPersonalityMeta(bot.data.personality);
                bot.label.innerHTML = `${meta.emoji} ${bot.data.botName} <span style="opacity:0.7;font-size:0.8em">💡${bot.postCount}</span>`;

                setSelectedBotInfo(prev => {
                  if (prev && prev.botId === msg.data.botId) {
                    return {
                      ...prev,
                      postCount: bot.postCount,
                      lifetimeStats: bot.data.lifetimeStats,
                    };
                  }
                  return prev;
                });
              }

              activityRef.current(prev => {
                const isDuplicate = prev.some(item => {
                  if (activityMsg.commentId && item.commentId) {
                    return item.commentId === activityMsg.commentId;
                  }
                  if (activityMsg.postId && item.postId && !activityMsg.commentId && !item.commentId) {
                    return item.postId === activityMsg.postId;
                  }
                  return false;
                });
                if (isDuplicate) {
                  console.log(`[ActivityFeed] Skipping duplicate message: ${activityMsg.text.substring(0, 30)}...`);
                  return prev;
                }
                const next = [activityMsg, ...prev];
                return next.slice(0, FEED_MAX_ITEMS);
              });
              break;
            }
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (disposed) return;
        console.log('🔴 Retrying ... signal');
        if (statusRef.current) {
          statusRef.current.textContent = '🔴 Retrying ... signal';
          statusRef.current.style.color = '#f87171';
        }
        reconnectTimer = setTimeout(connectWebSocket, WS_RECONNECT_MS);
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
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
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
  }, [containerRef, labelsRef, handleReset, onSimResetComplete, createBot, resizeGroundForBots, showSpeechBubble]);

  return {
    statusRef,
    feedRef,
    botsRef,
    wsConnected,
    activityFeed,
    selectedPost,
    postDetail,
    detailLoading,
    selectedBotInfo,
    setSelectedBotInfo,
    allBotsData,
    simSpeed,
    selectPost,
    setSpeed,
    fullReset,
    handleReset,
  };
}
