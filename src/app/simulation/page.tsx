'use client';

import { useEffect, useRef, useCallback, useState, useMemo, ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Content Renderer (handles markdown-style links and citations) ───

function renderContentWithLinks(content: string): ReactNode[] {
  const elements: ReactNode[] = [];
  let key = 0;
  
  // Pattern to match: ***text*** for bold italic, and [text](url) for links
  const combinedPattern = /(\*{3}[^*]+\*{3})|(\[[^\]]+\]\([^)]+\))/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = combinedPattern.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      elements.push(<span key={key++}>{content.slice(lastIndex, match.index)}</span>);
    }
    
    const matched = match[0];
    
    if (matched.startsWith('***') && matched.endsWith('***')) {
      // Bold italic: ***text***
      const innerText = matched.slice(3, -3);
      elements.push(
        <strong key={key++} style={{ fontStyle: 'italic', color: '#4a9eff' }}>
          {innerText}
        </strong>
      );
    } else if (matched.startsWith('[')) {
      // Link: [text](url)
      const linkMatch = matched.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const [, linkText, url] = linkMatch;
        elements.push(
          <a
            key={key++}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#60a5fa',
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
              cursor: 'pointer',
            }}
          >
            {linkText}
          </a>
        );
      }
    }
    
    lastIndex = match.index + matched.length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    elements.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }
  
  return elements.length > 0 ? elements : [<span key={0}>{content}</span>];
}

// ─── Types ───────────────────────────────────────────────────────

interface BotData {
  botId: string;
  botName: string;
  personality: string;
  x: number;
  y: number;
  z: number;
  state: string;
  lastPostTitle?: string;
  width?: number;   // 0.5–0.8m (from bridge)
  height?: number;  // 0.66–1.3m (from bridge)
  color?: string;   // hex color (from bridge)
}

interface BotEntity {
  group: THREE.Group;
  mesh: THREE.Mesh;
  label: HTMLDivElement;
  speechBubble: HTMLDivElement;
  targetPos: THREE.Vector3;
  data: BotData;
  postCount: number;       // Track number of posts
  recentPost?: ActivityMessage;  // Most recent post for click display
}

interface ActivityMessage {
  id: string;
  postId?: string;
  botName: string;
  botColor: string;
  text: string;
  content: string;
  time: string;
}

interface PostComment {
  id: string;
  content: string;
  createdAt: string;
  agent: { name: string };
}

interface PostDetail {
  comments: PostComment[];
  score: number;
  upvotes: number;
  downvotes: number;
  commentCount: number;
}

interface SelectedBotInfo {
  botId: string;
  botName: string;
  personality: string;
  postCount: number;
  color: string;
  state: string;
  height?: number;
  lastPostTime?: string;
}

// ─── Personality → Visual Config ─────────────────────────────────

const BOT_VISUALS: Record<string, {
  color: number;
  emissive: number;
  geometry: () => THREE.BufferGeometry;
  emoji: string;
  label: string;
}> = {
  tech: {
    color: 0x4a9eff,
    emissive: 0x1a3a66,
    geometry: () => new THREE.BoxGeometry(0.8, 0.8, 0.8),
    emoji: '🤖',
    label: 'Tech',
  },
  philo: {
    color: 0xb366ff,
    emissive: 0x3d1a66,
    geometry: () => new THREE.SphereGeometry(0.5, 32, 32),
    emoji: '🧠',
    label: 'Philosophy',
  },
  art: {
    color: 0xff8c42,
    emissive: 0x663a1a,
    geometry: () => new THREE.ConeGeometry(0.5, 1, 6),
    emoji: '🎨',
    label: 'Art',
  },
  science: {
    color: 0x42d68c,
    emissive: 0x1a663a,
    geometry: () => new THREE.CylinderGeometry(0.4, 0.4, 1, 16),
    emoji: '🔬',
    label: 'Science',
  },
};

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
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  // ─── Clock & Location ────────────────────────────────────────
  useEffect(() => {
    // Update time every second
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

  // ─── Sun Position Calculator ────────────────────────────────
  const calculateSunPosition = useCallback((date: Date, lat: number, lng: number) => {
    // Simplified solar position algorithm
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
    const hours = date.getHours() + date.getMinutes() / 60 + date.getTimezoneOffset() / 60 + lng / 15;
    const solarTime = hours + (4 * lng + 229.18) / 60;
    const hourAngle = (solarTime - 12) * 15 * Math.PI / 180;
    
    // Declination angle
    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180) * Math.PI / 180;
    const latRad = lat * Math.PI / 180;
    
    // Solar altitude (elevation above horizon)
    const sinAltitude = Math.sin(latRad) * Math.sin(declination) + 
                        Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
    const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
    
    // Solar azimuth
    const cosAzimuth = (Math.sin(declination) - Math.sin(latRad) * sinAltitude) / 
                       (Math.cos(latRad) * Math.cos(altitude));
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));
    if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
    
    return { altitude, azimuth };
  }, []);

  // ─── Dynamic Lighting Update ────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !sunLightRef.current || !ambientLightRef.current) return;
    
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
  }, [currentTime, location, calculateSunPosition]);

  // ─── UI Theme Based on Time of Day ──────────────────────────
  const uiTheme = useMemo(() => {
    const lat = location?.lat ?? 40.7128;
    const lng = location?.lng ?? -74.006;
    const { altitude } = calculateSunPosition(currentTime, lat, lng);
    
    // Normalize: 0 = midnight, 1 = noon
    const dayFactor = Math.max(0, Math.min(1, (altitude + 0.15) / (Math.PI / 2 + 0.15)));
    
    // Panel colors transition from dark (night) to light (day)
    const panelBg = `rgba(${Math.round(10 + dayFactor * 230)}, ${Math.round(10 + dayFactor * 230)}, ${Math.round(26 + dayFactor * 220)}, ${0.95 - dayFactor * 0.15})`;
    const borderColor = `rgba(${Math.round(74 + dayFactor * 100)}, ${Math.round(158 + dayFactor * 50)}, ${Math.round(255 - dayFactor * 50)}, ${0.15 + dayFactor * 0.2})`;
    const textPrimary = dayFactor > 0.5 ? '#333' : '#f0f0ff';
    const textSecondary = dayFactor > 0.5 ? '#555' : '#b0b0dd';
    const textMuted = dayFactor > 0.5 ? '#777' : '#9999bb';
    const cardBg = dayFactor > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    const cardBgHover = dayFactor > 0.5 ? 'rgba(74,158,255,0.15)' : 'rgba(74,158,255,0.12)';
    
    return { panelBg, borderColor, textPrimary, textSecondary, textMuted, cardBg, cardBgHover, dayFactor };
  }, [currentTime, location, calculateSunPosition]);

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
              }
              if (msg.data.bots) {
                for (const botData of msg.data.bots) {
                  if (botsRef.current.has(botData.botId)) {
                    const entity = botsRef.current.get(botData.botId)!;
                    entity.targetPos.set(botData.x, (botData.height || 1.0) / 2, botData.z);
                    entity.data = botData;
                  } else {
                    createBot(botData);
                  }
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
      for (const entity of botsRef.current.values()) {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a1a' }}>
      {/* Status bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>🌍</span>
          <span style={{ color: '#e0e0ff', fontWeight: 600, fontSize: '15px', letterSpacing: '0.5px' }}>
            Bot-Talker Simulation
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '12px', color: '#a0a0c0', fontFamily: 'monospace', textAlign: 'right' }}>
            <div>{currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
            <div>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          </div>
          {location && (
            <div style={{ fontSize: '11px', color: '#7a7a9a', fontFamily: 'monospace' }}>
              📍 {location.lat.toFixed(3)}, {location.lng.toFixed(3)}
            </div>
          )}
          <div
            ref={statusRef}
            style={{ fontSize: '13px', color: '#fbbf24', transition: 'color 0.3s' }}
          >
            ⏳ Connecting...
          </div>
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
          <button
            onClick={handleReset}
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

      {/* Activity Feed Panel */}
      {showFeed && (
        <div
          style={{
            position: 'absolute',
            top: '48px',
            left: '0',
            width: '280px',
            bottom: '0',
            background: uiTheme.panelBg,
            borderRight: `1px solid ${uiTheme.borderColor}`,
            zIndex: 10,
            fontFamily: "'Inter', system-ui, sans-serif",
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column' as const,
            transition: 'background 0.5s, border-color 0.5s',
          }}
        >
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${uiTheme.borderColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: uiTheme.textSecondary, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
              💬 Activity
            </span>
            <button
              onClick={() => setShowFeed(false)}
              style={{
                color: uiTheme.textMuted,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              ✕
            </button>
          </div>
          <div
            ref={feedRef}
            style={{
              flex: 1,
              overflowY: 'auto' as const,
              padding: '8px 12px',
            }}
          >
            {activityFeed.length === 0 && (
              <div style={{ color: uiTheme.textMuted, fontSize: '12px', textAlign: 'center' as const, marginTop: '20px' }}>
                Bot posts will appear here...
              </div>
            )}
            {activityFeed.map(msg => (
              <div
                key={msg.id}
                onClick={() => selectPost(msg)}
                style={{
                  padding: '8px 10px',
                  marginBottom: '6px',
                  background: selectedPost?.id === msg.id ? uiTheme.cardBgHover : uiTheme.cardBg,
                  borderRadius: '8px',
                  borderLeft: `3px solid ${msg.botColor}`,
                  animation: 'fadeInMsg 0.3s ease',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: msg.botColor, fontSize: '11px', fontWeight: 600 }}>
                    {msg.botName}
                  </span>
                  <span style={{ color: uiTheme.textMuted, fontSize: '10px' }}>
                    {msg.time}
                  </span>
                </div>
                <div style={{
                  color: uiTheme.textPrimary,
                  fontSize: '12px',
                  lineHeight: '1.4',
                  wordBreak: 'break-word' as const,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                  transition: 'color 0.5s',
                  fontWeight: 600,
                }}>
                  {msg.text}
                </div>
                {/* Content preview with citations */}
                {msg.content && (
                  <div style={{
                    color: uiTheme.textSecondary,
                    fontSize: '11px',
                    lineHeight: '1.4',
                    marginTop: '4px',
                    wordBreak: 'break-word' as const,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                    overflow: 'hidden',
                    transition: 'color 0.5s',
                  }}>
                    {renderContentWithLinks(msg.content.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feed toggle (when hidden) */}
      {!showFeed && (
        <button
          onClick={() => setShowFeed(true)}
          style={{
            position: 'absolute',
            top: '56px',
            left: '0',
            background: uiTheme.panelBg,
            border: `1px solid ${uiTheme.borderColor}`,
            borderLeft: 'none',
            borderRadius: '0 8px 8px 0',
            padding: '8px 10px',
            color: uiTheme.textSecondary,
            cursor: 'pointer',
            zIndex: 10,
            fontSize: '14px',
            transition: 'background 0.5s, border-color 0.5s, color 0.5s',
          }}
        >
          💬
        </button>
      )}

      {/* Bot Metrics Panel (upper left corner) */}
      {selectedBotInfo && (
        <div
          style={{
            position: 'absolute',
            top: '100px',
            left: showFeed ? '288px' : '8px',
            width: '215px',
            background: uiTheme.panelBg,
            border: `1px solid ${uiTheme.borderColor}`,
            borderRadius: '10px',
            zIndex: 15,
            fontFamily: "'Inter', system-ui, sans-serif",
            backdropFilter: 'blur(10px)',
            padding: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            transition: 'left 0.3s, background 0.5s, border-color 0.5s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: uiTheme.textSecondary, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
              📊 Bot Metrics
            </span>
            <button
              onClick={() => setSelectedBotInfo(null)}
              style={{
                color: uiTheme.textMuted,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0',
              }}
            >
              ✕
            </button>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            marginBottom: '12px',
            padding: '8px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            borderLeft: `3px solid ${selectedBotInfo.color}`,
          }}>
            <span style={{ fontSize: '24px' }}>
              {BOT_VISUALS[selectedBotInfo.personality]?.emoji || '🤖'}
            </span>
            <div>
              <div style={{ color: selectedBotInfo.color, fontWeight: 600, fontSize: '14px' }}>
                {selectedBotInfo.botName}
              </div>
              <div style={{ color: uiTheme.textMuted, fontSize: '10px', textTransform: 'capitalize' as const }}>
                {selectedBotInfo.personality}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div style={{ 
              background: 'rgba(74, 158, 255, 0.1)', 
              padding: '8px', 
              borderRadius: '6px',
              textAlign: 'center' as const,
            }}>
              <div style={{ color: '#4a9eff', fontSize: '18px', fontWeight: 700 }}>
                {selectedBotInfo.postCount}
              </div>
              <div style={{ color: uiTheme.textMuted, fontSize: '9px', textTransform: 'uppercase' as const }}>
                Posts
              </div>
            </div>
            <div style={{ 
              background: 'rgba(255, 152, 0, 0.1)', 
              padding: '8px', 
              borderRadius: '6px',
              textAlign: 'center' as const,
            }}>
              <div style={{ color: '#ff9800', fontSize: '14px', fontWeight: 700 }}>
                {selectedBotInfo.height ? `${selectedBotInfo.height.toFixed(2)}m` : '—'}
              </div>
              <div style={{ color: uiTheme.textMuted, fontSize: '9px', textTransform: 'uppercase' as const }}>
                Height
              </div>
            </div>
            <div style={{ 
              background: 'rgba(76, 175, 80, 0.1)', 
              padding: '8px', 
              borderRadius: '6px',
              textAlign: 'center' as const,
            }}>
              <div style={{ 
                color: selectedBotInfo.state === 'posting' ? '#fbbf24' : '#4caf50', 
                fontSize: '11px', 
                fontWeight: 600,
                textTransform: 'capitalize' as const,
              }}>
                {selectedBotInfo.state || 'idle'}
              </div>
              <div style={{ color: uiTheme.textMuted, fontSize: '9px', textTransform: 'uppercase' as const }}>
                Status
              </div>
            </div>
          </div>

          {selectedBotInfo.lastPostTime && (
            <div style={{ 
              marginTop: '10px', 
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '6px',
              fontSize: '10px',
              color: uiTheme.textMuted,
            }}>
              <span style={{ opacity: 0.7 }}>Last active:</span>{' '}
              <span style={{ color: uiTheme.textSecondary }}>{selectedBotInfo.lastPostTime}</span>
            </div>
          )}

          <div style={{ 
            marginTop: '10px', 
            fontSize: '9px', 
            color: uiTheme.textMuted,
            fontFamily: 'monospace',
            opacity: 0.6,
          }}>
            ID: {selectedBotInfo.botId.substring(0, 8)}...
          </div>
        </div>
      )}

      {/* Post Detail Panel (right side) */}
      {selectedPost && (
        <div
          style={{
            position: 'absolute',
            top: '48px',
            right: '0',
            width: '340px',
            bottom: '0',
            background: uiTheme.panelBg,
            borderLeft: `1px solid ${uiTheme.borderColor}`,
            zIndex: 10,
            fontFamily: "'Inter', system-ui, sans-serif",
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column' as const,
            animation: 'slideInRight 0.2s ease',
            transition: 'background 0.5s, border-color 0.5s',
          }}
        >
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${uiTheme.borderColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: uiTheme.textSecondary, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
              📄 Post Detail
            </span>
            <button
              onClick={() => selectPost(null)}
              style={{
                color: uiTheme.textMuted,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: selectedPost.botColor,
              }} />
              <a
                href={`/bot/${encodeURIComponent(selectedPost.botName)}`}
                style={{
                  color: selectedPost.botColor,
                  fontSize: '14px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  borderBottom: `1px dashed ${selectedPost.botColor}44`,
                  cursor: 'pointer',
                }}
              >
                {selectedPost.botName}
              </a>
              <span style={{ color: uiTheme.textMuted, fontSize: '11px', marginLeft: 'auto' }}>
                {selectedPost.time}
              </span>
            </div>
            {selectedPost.text && (
              <h3 style={{
                color: uiTheme.textPrimary,
                fontSize: '16px',
                fontWeight: 700,
                marginBottom: '12px',
                lineHeight: '1.4',
                transition: 'color 0.5s',
              }}>
                {selectedPost.text}
              </h3>
            )}
            <div style={{
              color: uiTheme.dayFactor > 0.5 ? '#555' : '#ccc',
              fontSize: '13px',
              lineHeight: '1.7',
              whiteSpace: 'pre-wrap' as const,
              wordBreak: 'break-word' as const,
              transition: 'color 0.5s',
            }}>
              {renderContentWithLinks(selectedPost.content)}
            </div>

            {/* Votes */}
            {postDetail && (
              <div style={{
                display: 'flex',
                gap: '20px',
                marginTop: '16px',
                padding: '12px 0',
                borderTop: `1px solid ${uiTheme.borderColor}`,
                fontSize: '14px',
                fontWeight: 500,
              }}>
                <span style={{ color: '#4ade80' }}>
                  👍 {postDetail.upvotes}
                </span>
                <span style={{ color: '#f87171' }}>
                  👎 {postDetail.downvotes}
                </span>
              </div>
            )}

            {/* Comments */}
            {detailLoading && (
              <div style={{ color: uiTheme.textMuted, fontSize: '12px', marginTop: '16px' }}>⏳ Loading comments...</div>
            )}
            {postDetail && postDetail.comments.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  color: uiTheme.textSecondary,
                  fontSize: '11px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase' as const,
                  marginBottom: '10px',
                }}>
                  💬 Comments ({postDetail.commentCount})
                </div>
                {postDetail.comments.map(comment => (
                  <div
                    key={comment.id}
                    style={{
                      background: uiTheme.cardBg,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '8px',
                      borderLeft: `2px solid ${uiTheme.borderColor}`,
                      transition: 'background 0.5s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <a
                        href={`/bot/${encodeURIComponent(comment.agent.name)}`}
                        style={{
                          color: uiTheme.textSecondary,
                          fontSize: '11px',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        {comment.agent.name}
                      </a>
                      <span style={{ color: uiTheme.textMuted, fontSize: '10px' }}>
                        {new Date(comment.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{
                      color: uiTheme.dayFactor > 0.5 ? '#555' : '#ccc',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap' as const,
                      wordBreak: 'break-word' as const,
                      transition: 'color 0.5s',
                    }}>
                      {renderContentWithLinks(comment.content)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {postDetail && postDetail.comments.length === 0 && !detailLoading && (
              <div style={{ color: uiTheme.textMuted, fontSize: '12px', marginTop: '16px', fontStyle: 'italic' }}>
                No comments yet
              </div>
            )}
          </div>
        </div>
      )}

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
