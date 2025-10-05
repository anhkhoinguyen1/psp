import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GenerateImage } from '@/api/integrations';

const SENSOR_COUNT = 8;

// U-shape positions in pillow space (x,z), y auto-offset
const SENSOR_LAYOUT = [
  { x: -1.35, z: 1.10 }, // 1
  { x: -1.90, z: 0.30 }, // 2
  { x: -1.15, z: -0.35 }, // 3
  { x: -0.40, z: -0.70 }, // 4
  { x: 0.40, z: -0.70 }, // 5
  { x: 1.15, z: -0.35 }, // 6
  { x: 1.90, z: 0.30 }, // 7
  { x: 1.35, z: 1.10 }, // 8
];

const LEFT_IDS = [1, 2, 3];
const RIGHT_IDS = [6, 7, 8];

const API_BASE = 'http://localhost:3000';

// ------- helpers (API + mapping) -------

async function fetchLatestRow() {
  const res = await fetch(`${API_BASE}/api/latest-one`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.doc || null;
}

// If DB array is 0..100, normalize to 0..1; ensure 8 values.
function normalizeFsrArray(arr) {
  if (!Array.isArray(arr)) return Array(8).fill(0);
  const hasOverOne = arr.some(v => Number(v) > 1);
  const scale = hasOverOne ? 1 / 100 : 1;
  const out = [];
  for (let i = 0; i < 8; i++) {
    const v = Number(arr[i] ?? 0) * scale;
    out.push(Math.max(0, Math.min(1, v)));
  }
  return out;
}

// Linear map v in [inMin,inMax] → [outMin,outMax]
function lerpMap(v, inMin, inMax, outMin, outMax) {
  const t = Math.max(0, Math.min(1, (v - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}

// Given normalized fsr[0..7], compute desired turn angle.
// Left group (1–3): 30→-25°, 100→-70°
// Right group (6–8): 30→+25°, 100→+70°
// If both <30 → 0°. If both ≥30 → side with greater max wins.
function angleFromFsr(fsr) {
  const leftMaxPct = Math.max(fsr[0] || 0, fsr[1] || 0, fsr[2] || 0) * 100;
  const rightMaxPct = Math.max(fsr[5] || 0, fsr[6] || 0, fsr[7] || 0) * 100;

  const LEFT_THR = 30;
  const RIGHT_THR = 30;

  const leftActive = leftMaxPct >= LEFT_THR;
  const rightActive = rightMaxPct >= RIGHT_THR;

  if (!leftActive && !rightActive) return 0;

  if (leftActive && (!rightActive || leftMaxPct >= rightMaxPct)) {
    // 30..100 → -25..-70
    return lerpMap(leftMaxPct, 30, 100, -25, -70);
  } else {
    // 30..100 → +25..+70
    return lerpMap(rightMaxPct, 30, 100, 25, 70);
  }
}

// Smooth roll from sensor energy (kept for UI animation fallback)
function rollFromSensors(vals) {
  const sum = (ids) => ids.reduce((a, id) => a + (vals[id - 1] || 0), 0);
  const left = sum(LEFT_IDS);
  const right = sum(RIGHT_IDS);
  const diff = right - left;
  const clamped = Math.max(-1, Math.min(1, diff));
  return clamped * 30;
}

const VisualDemo = () => {
  const headCanvasRef = useRef(null);

  const [rollDeg, setRollDeg] = useState(0);
  const rollDegRef = useRef(0);

  const sensorValuesRef = useRef(Array(8).fill(0));
  const externalRollOverrideRef = useRef(null);

  const [, forceUpdate] = useState(0);

  const scenesRef = useRef({ pillow: null, head: null });
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Pillow texture generation
  const [isGeneratingPillow, setIsGeneratingPillow] = useState(false);
  const pillowMeshRef = useRef(null);

  useEffect(() => {
    rollDegRef.current = rollDeg;
  }, [rollDeg]);

  // Generate realistic pillow texture
  const generatePillowTexture = async () => {
    setIsGeneratingPillow(true);
    try {
      const result = await GenerateImage({
        prompt:
          "Ultra-realistic white quilted pillow texture, top-down product photography, 2048x2048 square. Soft white cotton fabric with subtle rectangular grid quilting pattern, horizontal and vertical stitched seams creating clean geometric sections. Medical-grade pristine white pillow (#FFFFFF to #F8F9FA), gentle shadows in quilted indentations, soft fabric weave texture visible. Professional studio lighting from above, even diffused illumination, slight highlights on raised quilted sections. Photorealistic render, seamless tileable pattern, no harsh shadows, clean background. 4K quality, neutral white balance, product photography style."
      });

      if (result.url && pillowMeshRef.current) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(result.url, (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(2.5, 0.8);
          texture.needsUpdate = true;

          if (pillowMeshRef.current?.material) {
            pillowMeshRef.current.material.map = texture;
            pillowMeshRef.current.material.needsUpdate = true;
          }
        });
      }
    } catch (error) {
      console.error('Failed to generate pillow texture:', error);
      alert('Failed to generate pillow texture. Please try again.');
    } finally {
      setIsGeneratingPillow(false);
    }
  };

  // Reference visualization component
  const SensorReferenceView = () => {
    const viewWidth = 600;
    const viewHeight = 400;
    const pillowWidth = 520;
    const pillowHeight = 280;
    const sensorSize = 48;

    const scale = 75;
    const centerX = viewWidth / 2;
    const centerY = viewHeight / 2;

    const positions2D = SENSOR_LAYOUT.map(pos => ({
      x: centerX + pos.x * scale,
      y: centerY + pos.z * scale
    }));

    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="w-full h-full">
        <defs>
          <filter id="sensor-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <radialGradient id="sensor-glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#14b8a6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="pillow-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f9fafb" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f3f4f6" />
          </linearGradient>
        </defs>

        <rect
          x={(viewWidth - pillowWidth) / 2}
          y={(viewHeight - pillowHeight) / 2}
          width={pillowWidth}
          height={pillowHeight}
          rx="20"
          fill="url(#pillow-gradient)"
          stroke="#e5e7eb"
          strokeWidth="2"
        />

        <g opacity="0.15" stroke="#9ca3af" strokeWidth="1" fill="none">
          {[...Array(8)].map((_, i) => (
            <line
              key={`h-${i}`}
              x1={(viewWidth - pillowWidth) / 2}
              y1={(viewHeight - pillowHeight) / 2 + (pillowHeight / 8) * (i + 1)}
              x2={(viewWidth + pillowWidth) / 2}
              y2={(viewHeight - pillowHeight) / 2 + (pillowHeight / 8) * (i + 1)}
            />
          ))}
          {[...Array(10)].map((_, i) => (
            <line
              key={`v-${i}`}
              x1={(viewWidth - pillowWidth) / 2 + (pillowWidth / 10) * (i + 1)}
              y1={(viewHeight - pillowHeight) / 2}
              x2={(viewWidth - pillowWidth) / 2 + (pillowWidth / 10) * (i + 1)}
              y2={(viewHeight + pillowHeight) / 2}
            />
          ))}
        </g>

        {positions2D.map((pos, i) => {
          const value = sensorValuesRef.current[i] || 0;
          const isActive = value > 0.1;

          return (
            <g key={i}>
              {isActive && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={sensorSize * 1.2}
                  fill="url(#sensor-glow)"
                  opacity={value * 0.6}
                />
              )}

              <rect
                x={pos.x - sensorSize / 2}
                y={pos.y - sensorSize / 2}
                width={sensorSize}
                height={sensorSize}
                rx="8"
                fill={isActive ? '#14b8a6' : '#6b7280'}
                filter="url(#sensor-shadow)"
                style={{
                  transition: 'fill 0.3s ease',
                  transform: `scale(${1 + value * 0.08})`,
                  transformOrigin: `${pos.x}px ${pos.y}px`
                }}
              />

              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="24"
                fontWeight="bold"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {i + 1}
              </text>

              {isActive && (
                <g>
                  <rect
                    x={pos.x - sensorSize / 2}
                    y={pos.y + sensorSize / 2 + 6}
                    width={sensorSize}
                    height="4"
                    rx="2"
                    fill="#e5e7eb"
                  />
                  <rect
                    x={pos.x - sensorSize / 2}
                    y={pos.y + sensorSize / 2 + 6}
                    width={sensorSize * value}
                    height="4"
                    rx="2"
                    fill="#14b8a6"
                    style={{ transition: 'width 0.2s ease' }}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + sensorSize / 2 + 18}
                    textAnchor="middle"
                    fill="#374151"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {(value * 100).toFixed(0)}%
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <g transform={`translate(20, ${viewHeight - 60})`}>
          <text x="0" y="0" fontSize="11" fontWeight="600" fill="#374151">
            Sensor Layout (Top View)
          </text>
          <text x="0" y="16" fontSize="9" fill="#6b7280">
            Left: 1-3 | Center: 4-5 | Right: 6-8
          </text>
        </g>
      </svg>
    );
  };

  // Demo buttons
  const handleTestSensors = () => {
    window.updateSensors?.({ 1: 0, 2: 0, 3: 0, 4: 0.95, 5: 1.0, 6: 0, 7: 0, 8: 0 });
    window.setRollDeg?.(0);
  };
  const handleTestLeft = () => {
    window.updateSensors?.({ 1: 0.75, 2: 1.0, 3: 0.85, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 });
    window.setRollDeg?.(-25);
  };
  const handleTestRight = () => {
    window.updateSensors?.({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0.85, 7: 1.0, 8: 0.75 });
    window.setRollDeg?.(25);
  };
  const handleTestVolume = () => {
    const randomVolume = Math.floor(Math.random() * 40) + 60;
    window.updateVolume?.(randomVolume);
  };
  const handleTestTemperature = () => {
    const randomTemp = (Math.random() * 5) + 33;
    window.updateTemperature?.(randomTemp);
  };
  const handleResetSensors = () => {
    window.updateSensors?.({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 });
    window.setRollDeg?.(0);
  };

  // Wire window API for sensors/angle
  useEffect(() => {
    window.updateSensors = (m) => {
      const next = sensorValuesRef.current.slice();
      for (let k in m) {
        const idx = Number(k) - 1;
        if (idx >= 0 && idx < 8) next[idx] = Number(m[k]);
      }
      sensorValuesRef.current = next;

      // If no external override, keep automatic yaw from sensors (used by demo buttons)
      if (externalRollOverrideRef.current == null) {
        const newRoll = rollFromSensors(next);
        rollDegRef.current = newRoll;
        setRollDeg(newRoll);
      }
    };

    window.setRollDeg = (deg) => {
      externalRollOverrideRef.current = Number.isFinite(deg) ? deg : null;
      if (externalRollOverrideRef.current != null) {
        rollDegRef.current = externalRollOverrideRef.current;
        setRollDeg(externalRollOverrideRef.current);
      }
    };

    return () => {
      delete window.updateSensors;
      delete window.setRollDeg;
    };
  }, []);

  // Small heartbeat render
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(prev => prev + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // HEAD + BODY VISUALIZATION (the whole group rotates with rollDeg)
  useEffect(() => {
    if (!headCanvasRef.current) return;

    const container = headCanvasRef.current;
    const size = Math.min(container.clientWidth, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);
    scene.fog = new THREE.Fog(0xf8f9fa, 5, 12);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 4.5, 3.5);
    camera.lookAt(0, 0.1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 6, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-3, 4, -2);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xe0f7ff, 0.4);
    backLight.position.set(0, 2, -3);
    scene.add(backLight);

    // GROUP CONTAINS HEAD + TORSO + ARMS (this is the whole "body" that rotates)
    const headGroup = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: 0xe8d5c4, shininess: 30, flatShading: false });

    const headGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = 1.2;
    head.scale.set(1, 1.15, 0.95);
    head.castShadow = true;
    head.receiveShadow = true;
    headGroup.add(head);

    const noseGeometry = new THREE.ConeGeometry(0.08, 0.2, 8);
    const nose = new THREE.Mesh(noseGeometry, material);
    nose.position.set(0, 1.2, 0.45);
    nose.rotation.x = Math.PI / 2;
    nose.castShadow = true;
    headGroup.add(nose);

    const eyeMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const eyeGeometry = new THREE.SphereGeometry(0.08, 16, 16);

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.18, 1.3, 0.38);
    leftEye.scale.set(1, 0.8, 0.5);
    leftEye.castShadow = true;
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.18, 1.3, 0.38);
    rightEye.scale.set(1, 0.8, 0.5);
    rightEye.castShadow = true;
    headGroup.add(rightEye);

    const browGeometry = new THREE.BoxGeometry(0.2, 0.03, 0.03);
    const browMaterial = new THREE.MeshPhongMaterial({ color: 0x8b7355 });

    const leftBrow = new THREE.Mesh(browGeometry, browMaterial);
    leftBrow.position.set(-0.18, 1.42, 0.42);
    leftBrow.rotation.z = -0.1;
    leftBrow.castShadow = true;
    headGroup.add(leftBrow);

    const rightBrow = new THREE.Mesh(browGeometry, browMaterial);
    rightBrow.position.set(0.18, 1.42, 0.42);
    rightBrow.rotation.z = 0.1;
    rightBrow.castShadow = true;
    headGroup.add(rightBrow);

    const mouthGeometry = new THREE.TorusGeometry(0.12, 0.02, 8, 16, Math.PI);
    const mouthMaterial = new THREE.MeshPhongMaterial({ color: 0xaa6666 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, 1.05, 0.42);
    mouth.rotation.x = Math.PI;
    mouth.castShadow = true;
    headGroup.add(mouth);

    const earGeometry = new THREE.SphereGeometry(0.12, 16, 16);

    const leftEar = new THREE.Mesh(earGeometry, material);
    leftEar.position.set(-0.48, 1.2, 0);
    leftEar.scale.set(0.6, 1, 0.4);
    leftEar.castShadow = true;
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeometry, material);
    rightEar.position.set(0.48, 1.2, 0);
    rightEar.scale.set(0.6, 1, 0.4);
    rightEar.castShadow = true;
    headGroup.add(rightEar);

    const neckGeometry = new THREE.CylinderGeometry(0.18, 0.20, 0.5, 16);
    const neck = new THREE.Mesh(neckGeometry, material);
    neck.position.y = 0.8;
    neck.castShadow = true;
    neck.receiveShadow = true;
    headGroup.add(neck);

    const shoulderGeometry = new THREE.SphereGeometry(0.22, 12, 12);

    const leftShoulder = new THREE.Mesh(shoulderGeometry, material);
    leftShoulder.position.set(-0.48, 0.55, 0);
    leftShoulder.scale.set(1.4, 0.9, 1);
    leftShoulder.castShadow = true;
    headGroup.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(shoulderGeometry, material);
    rightShoulder.position.set(0.48, 0.55, 0);
    rightShoulder.scale.set(1.4, 0.9, 1);
    rightShoulder.castShadow = true;
    headGroup.add(rightShoulder);

    const upperTorsoGeometry = new THREE.BoxGeometry(0.765, 0.714, 0.357, 12, 12, 12);
    const upperTorso = new THREE.Mesh(upperTorsoGeometry, material);
    upperTorso.position.y = 0.28;

    const positionAttribute = upperTorsoGeometry.attributes.position;
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      const z = positionAttribute.getZ(i);
      const smoothFactor = 0.94;
      positionAttribute.setXYZ(i, x * smoothFactor, y * smoothFactor, z * smoothFactor);
    }
    positionAttribute.needsUpdate = true;
    upperTorsoGeometry.computeVertexNormals();

    upperTorso.castShadow = true;
    upperTorso.receiveShadow = true;
    headGroup.add(upperTorso);

    const upperArmGeometry = new THREE.CylinderGeometry(0.10, 0.09, 1.1, 12);

    const leftUpperArm = new THREE.Mesh(upperArmGeometry, material);
    leftUpperArm.position.set(-0.48, -0.06, 0);
    leftUpperArm.rotation.z = 0.02;
    leftUpperArm.castShadow = true;
    headGroup.add(leftUpperArm);

    const rightUpperArm = new THREE.Mesh(upperArmGeometry, material);
    rightUpperArm.position.set(0.48, -0.06, 0);
    rightUpperArm.rotation.z = -0.02;
    rightUpperArm.castShadow = true;
    headGroup.add(rightUpperArm);

    const collarMaterial = new THREE.MeshPhongMaterial({ color: 0xd4c0a8 });
    const collarGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8);

    const leftCollar = new THREE.Mesh(collarGeometry, collarMaterial);
    leftCollar.position.set(-0.25, 0.38, 0.1);
    leftCollar.rotation.z = -0.4;
    leftCollar.castShadow = true;
    headGroup.add(leftCollar);

    const rightCollar = new THREE.Mesh(collarGeometry, collarMaterial);
    rightCollar.position.set(0.25, 0.38, 0.1);
    rightCollar.rotation.z = 0.4;
    rightCollar.castShadow = true;
    headGroup.add(rightCollar);

    headGroup.position.y = -0.05;
    headGroup.position.z = 1;
    headGroup.rotation.x = -Math.PI / 2;

    scene.add(headGroup);

    const textureLoader = new THREE.TextureLoader();
    const pillowTexture = textureLoader.load('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e19bb594a865a11b5f51ec/1839cc8cf_image.png');
    pillowTexture.wrapS = THREE.RepeatWrapping;
    pillowTexture.wrapT = THREE.RepeatWrapping;
    pillowTexture.repeat.set(2.5, 0.8);

    const pillowGeo = new THREE.BoxGeometry(2.75, 0.35, 1.6, 40, 15, 25);
    const pillowPos = pillowGeo.attributes.position;

    for (let i = 0; i < pillowPos.count; i++) {
      const x = pillowPos.getX(i);
      const z = pillowPos.getZ(i);
      const y = pillowPos.getY(i);

      const absX = Math.abs(x);
      const absZ = Math.abs(z);
      const edgeDistX = (2.75 / 2) - absX;
      const edgeDistZ = (1.6 / 2) - absZ;

      if (y > 0) {
        const dist = Math.sqrt(x * x * 0.15 + z * z * 0.5);
        const dip = Math.exp(-dist * 0.15);

        const edgeCurveX = Math.min(1, edgeDistX / 0.5);
        const edgeCurveZ = Math.min(1, edgeDistZ / 0.3);
        const edgeFactor = Math.pow(edgeCurveX * edgeCurveZ, 2);

        pillowPos.setY(i, y * edgeFactor - dip * 0.15 + edgeFactor * 0.04);
      } else {
        const edgeCurveX = Math.min(1, edgeDistX / 0.4);
        const edgeCurveZ = Math.min(1, edgeDistZ / 0.3);
        const bottomEdgeFactor = Math.pow(edgeCurveX * edgeCurveZ, 2);
        const bulgeFactor = (1 - bottomEdgeFactor) * 0.15;
        pillowPos.setY(i, y * bottomEdgeFactor - bulgeFactor);
      }
    }

    pillowPos.needsUpdate = true;
    pillowGeo.computeVertexNormals();

    const pillowMat = new THREE.MeshStandardMaterial({
      map: pillowTexture,
      roughness: 0.85,
      metalness: 0.02
    });
    const pillowMesh = new THREE.Mesh(pillowGeo, pillowMat);
    pillowMesh.position.y = -0.25;
    pillowMesh.receiveShadow = true;
    pillowMesh.castShadow = true;
    scene.add(pillowMesh);

    pillowMeshRef.current = pillowMesh;

    const groundGeometry = new THREE.PlaneGeometry(12, 12);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.12 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    let animationId;
    let currentRoll = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const dampingFactor = prefersReducedMotion.current ? 0.05 : 0.15;
      currentRoll += ((rollDegRef.current ?? 0) - currentRoll) * dampingFactor;

      // This rotates the *entire body model*
      headGroup.rotation.y = (currentRoll * Math.PI) / 180;

      const lightOffset = currentRoll * 0.05;
      keyLight.position.x = 3 + lightOffset;
      fillLight.position.x = -3 - lightOffset;

      renderer.render(scene, camera);
    };

    animate();

    const resizeObserver = new ResizeObserver(() => {
      const newSize = Math.min(container.clientWidth, container.clientHeight);
      renderer.setSize(newSize, newSize);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    });

    resizeObserver.observe(container);

    scenesRef.current.head = { scene, camera, renderer, headGroup };

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      pillowTexture.dispose();
      pillowMeshRef.current = null;
    };
  }, []);

  // LIVE DATA POLL (500 ms) → sensors, angle, volume, temp
  useEffect(() => {
    let stop = false;
    let timer = null;

    const tick = async () => {
      try {
        const doc = await fetchLatestRow();
        if (!doc || stop) return;

        const fsr = normalizeFsrArray(doc.fsr);      // 0..1 each
        const t1 = Number(doc.t1_c ?? 0);
        const t2 = Number(doc.t2_c ?? 0);
        const vol = Number(doc.volume ?? 0);

        // Update sensor tiles (and their mini bars)
        const fsrMap = { 1: fsr[0], 2: fsr[1], 3: fsr[2], 4: fsr[3], 5: fsr[4], 6: fsr[5], 7: fsr[6], 8: fsr[7] };
        window.updateSensors?.(fsrMap);

        // Compute turn per your thresholds and apply to full body model
        const angle = angleFromFsr(fsr);
        window.setRollDeg?.(angle);

        // Charts
        window.updateVolume?.(vol);
        const tempAvg = (t1 && t2) ? (t1 + t2) / 2 : (t1 || t2 || 0);
        window.updateTemperature?.(tempAvg);
      } catch (err) {
        // swallow; show steady UI
      } finally {
        if (!stop) timer = setTimeout(tick, 500); // 0.5 s
      }
    };

    tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, []);

  const getPositionLabel = () => {
    if (Math.abs(rollDeg) < 8) return 'Center';
    return rollDeg < 0 ? 'Left Turn' : 'Right Turn';
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100">
      <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold bg-gradient-to-r from-gray-800 to-teal-600 bg-clip-text text-transparent">
              Patient Sleep Position Monitor
            </h1>
            <p className="text-sm text-gray-600 mt-1">Real-time pressure distribution analysis</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={generatePillowTexture}
              disabled={isGeneratingPillow}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg text-sm"
            >
              {isGeneratingPillow ? 'Generating...' : 'Generate Pillow Texture'}
            </button>
            <div className="text-right mr-4">
              <div className="text-sm font-medium text-gray-600">Current Position</div>
              <div className="text-lg font-semibold text-teal-600">{getPositionLabel()}</div>
            </div>

            <div className="flex gap-2 border-l border-gray-300 pl-4">
              <button onClick={handleTestSensors} className="px-3 py-1.5 text-xs font-medium text-white bg-teal-500 hover:bg-teal-600 rounded-lg transition-colors">
                Test Center
              </button>
              <button onClick={handleTestLeft} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors">
                Test Left
              </button>
              <button onClick={handleTestRight} className="px-3 py-1.5 text-xs font-medium text-white bg-purple-500 hover:bg-purple-600 rounded-lg transition-colors">
                Test Right
              </button>
              <button onClick={handleTestVolume} className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors">
                Test Volume
              </button>
              <button onClick={handleTestTemperature} className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                Test Temp
              </button>
              <button onClick={handleResetSensors} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors">
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-5 p-5 overflow-visible items-center justify-center">
        <div className="w-full max-w-lg lg:max-w-none lg:flex-1 aspect-square bg-white rounded-2xl shadow-xl overflow-hidden relative border border-gray-200">
          <div className="absolute top-5 left-5 z-30 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-lg border border-gray-100">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Live Sensor Monitor</div>
          </div>
          <div className="w-full h-full p-8 flex items-center justify-center">
            <SensorReferenceView />
          </div>
        </div>

        <div className="w-full max-w-lg lg:max-w-none lg:flex-1 aspect-square bg-white rounded-2xl shadow-xl overflow-hidden relative border border-gray-200">
          <div className="absolute top-5 left-5 z-30 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-lg border border-gray-100">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Head Position</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Patient View (Face Up)</div>
          </div>
          <div className="absolute top-5 right-5 z-30 bg-gradient-to-br from-teal-50 to-white backdrop-blur-md px-5 py-3 rounded-xl shadow-lg border border-teal-100">
            <div className="text-xs text-gray-600">Turn Angle</div>
            <div className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
              {rollDeg.toFixed(1)}°
            </div>
          </div>
          <div ref={headCanvasRef} className="w-full h-full flex items-center justify-center relative z-10" />
        </div>
      </div>

      <div className="bg-white/95 backdrop-blur-sm border-t border-gray-200 px-6 py-6 shadow-2xl">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-r from-purple-50 to-blue-50/50 rounded-xl p-6 border-2 border-purple-200">
            <div className="text-sm font-semibold text-gray-700 mb-3">Real-Time Volume Monitor</div>

            <div className="relative w-full h-96 bg-white/90 rounded-2xl border-2 border-purple-200 p-4 shadow-lg mb-4">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-semibold text-gray-600">
                Volume (dB)
              </div>
              <canvas id="volumeChart" className="w-full h-full" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-600">
                Time
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600" id="volumeDecibel">0.0</div>
                <div className="text-xs text-gray-600 font-medium">dB Current</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-purple-700" id="peakVolume">0.0</div>
                <div className="text-xs text-gray-600 font-medium">dB Peak</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-purple-700" id="avgVolume">0.0</div>
                <div className="text-xs text-gray-600 font-medium">dB Average</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500" id="lastUpdated">Never</div>
                <div className="text-[10px] text-gray-400">Last Updated</div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs font-semibold text-gray-700 mb-2">API Integration Guide</div>
              <code className="text-[10px] text-gray-600 block bg-white p-2 rounded font-mono mb-2">
                {`// Update sensors: window.updateSensors({1: 0.5, 2: 0.8, ...})`}
              </code>
              <code className="text-[10px] text-gray-600 block bg-white p-2 rounded font-mono mb-2">
                {`// Update volume: window.updateVolume(decibelValue)`}
              </code>
              <code className="text-[10px] text-gray-600 block bg-white p-2 rounded font-mono mb-2">
                {`// Update temperature: window.updateTemperature(celsiusValue)`}
              </code>
              <code className="text-[10px] text-gray-600 block bg-white p-2 rounded font-mono">
                {`// Set head angle: window.setRollDeg(degrees)`}
              </code>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-teal-50/50 rounded-xl p-6 border-2 border-blue-200 mt-6">
            <div className="text-sm font-semibold text-gray-700 mb-3">Real-Time Temperature Monitor</div>

            <div className="relative w-full h-96 bg-white/90 rounded-2xl border-2 border-blue-200 p-4 shadow-lg mb-4">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-semibold text-gray-600">
                Temperature (°C)
              </div>
              <canvas id="temperatureChart" className="w-full h-full" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-600">
                Time
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600" id="temperatureCurrent">0.0</div>
                <div className="text-xs text-gray-600 font-medium">°C Current</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-blue-700" id="peakTemperature">0.0</div>
                <div className="text-xs text-gray-600 font-medium">°C Peak</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-blue-700" id="avgTemperature">0.0</div>
                <div className="text-xs text-gray-600 font-medium">°C Average</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500" id="tempLastUpdated">Never</div>
                <div className="text-[10px] text-gray-400">Last Updated</div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-teal-50 rounded-lg border border-teal-200">
              <div className="text-xs font-semibold text-gray-700 mb-2">Temperature Range Guidelines</div>
              <div className="text-[10px] text-gray-600">
                Normal post-operative range: <span className="font-mono bg-white px-1 rounded">31-36°C</span>. Alert if temperature exceeds <span className="font-mono bg-white px-1 rounded">37.5°C</span> or falls below <span className="font-mono bg-white px-1 rounded">31°C</span>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Volume and Temperature chart code (canvas 2D)
if (typeof window !== 'undefined') {
  let peakVolume = 0.0;
  let averageVolume = 0.0;
  let updateCount = 0;
  let volumeHistory = [];
  let timeHistory = [];
  const maxDataPoints = 50;
  let chartCanvas = null;
  let chartCtx = null;

  let peakTemperature = 0.0;
  let averageTemperature = 0.0;
  let tempUpdateCount = 0;
  let temperatureHistory = [];
  let tempTimeHistory = [];
  let tempChartCanvas = null;
  let tempChartCtx = null;

  setTimeout(() => {
    chartCanvas = document.getElementById('volumeChart');
    if (chartCanvas) {
      chartCtx = chartCanvas.getContext('2d');
      chartCanvas.width = chartCanvas.offsetWidth;
      chartCanvas.height = chartCanvas.offsetHeight;

      new ResizeObserver(() => {
        if (chartCanvas && chartCtx) {
          chartCanvas.width = chartCanvas.offsetWidth;
          chartCanvas.height = chartCanvas.offsetHeight;
          drawChart();
        }
      }).observe(chartCanvas);

      drawChart();
    }

    tempChartCanvas = document.getElementById('temperatureChart');
    if (tempChartCanvas) {
      tempChartCtx = tempChartCanvas.getContext('2d');
      tempChartCanvas.width = tempChartCanvas.offsetWidth;
      tempChartCanvas.height = tempChartCanvas.offsetHeight;

      new ResizeObserver(() => {
        if (tempChartCanvas && tempChartCtx) {
          tempChartCanvas.width = tempChartCanvas.offsetWidth;
          tempChartCanvas.height = tempChartCanvas.offsetHeight;
          drawTemperatureChart();
        }
      }).observe(tempChartCanvas);

      drawTemperatureChart();
    }
  }, 100);

  function drawChart() {
    if (!chartCtx || !chartCanvas) return;

    const width = chartCanvas.width;
    const height = chartCanvas.height;
    const padding = 40;

    chartCtx.clearRect(0, 0, width, height);

    if (volumeHistory.length === 0) return;

    const minDbGraph = 0;
    let maxDbGraph = Math.max(100, Math.ceil(peakVolume / 10) * 10 + 10);
    if (maxDbGraph < 50) maxDbGraph = 50;

    const dbRange = maxDbGraph - minDbGraph;

    chartCtx.strokeStyle = '#e5e7eb';
    chartCtx.lineWidth = 1;

    for (let i = 0; i <= 5; i++) {
      const db = minDbGraph + (dbRange / 5) * i;
      const y = height - padding - ((db - minDbGraph) / dbRange) * (height - padding * 2);

      chartCtx.beginPath();
      chartCtx.moveTo(padding, y);
      chartCtx.lineTo(width - padding / 2, y);
      chartCtx.stroke();

      chartCtx.fillStyle = '#6b7280';
      chartCtx.font = '10px sans-serif';
      chartCtx.textAlign = 'right';
      chartCtx.fillText(db.toFixed(0), padding - 5, y + 3);
    }

    if (volumeHistory.length > 1) {
      chartCtx.strokeStyle = '#a855f7';
      chartCtx.lineWidth = 2;
      chartCtx.beginPath();

      volumeHistory.forEach((db, index) => {
        const x = padding + (index / (maxDataPoints - 1)) * (width - padding * 1.5);
        const y = height - padding - ((db - minDbGraph) / dbRange) * (height - padding * 2);

        if (index === 0) {
          chartCtx.moveTo(x, y);
        } else {
          chartCtx.lineTo(x, y);
        }
      });

      chartCtx.stroke();

      const lastX = padding + ((volumeHistory.length - 1) / (maxDataPoints - 1)) * (width - padding * 1.5);
      chartCtx.lineTo(lastX, height - padding);
      chartCtx.lineTo(padding, height - padding);
      chartCtx.closePath();
      chartCtx.fillStyle = 'rgba(168, 85, 247, 0.1)';
      chartCtx.fill();

      chartCtx.fillStyle = '#a855f7';
      volumeHistory.forEach((db, index) => {
        const x = padding + (index / (maxDataPoints - 1)) * (width - padding * 1.5);
        const y = height - padding - ((db - minDbGraph) / dbRange) * (height - padding * 2);

        chartCtx.beginPath();
        chartCtx.arc(x, y, 3, 0, Math.PI * 2);
        chartCtx.fill();
      });
    }

    chartCtx.strokeStyle = '#374151';
    chartCtx.lineWidth = 2;

    chartCtx.beginPath();
    chartCtx.moveTo(padding, padding / 2);
    chartCtx.lineTo(padding, height - padding);
    chartCtx.stroke();

    chartCtx.beginPath();
    chartCtx.moveTo(padding, height - padding);
    chartCtx.lineTo(width - padding / 2, height - padding);
    chartCtx.stroke();
  }

  // -------- CLEAN AUTO-SCALING TEMPERATURE CHART --------
  function drawTemperatureChart() {
    if (!tempChartCtx || !tempChartCanvas) return;

    const ctx = tempChartCtx;
    const canvas = tempChartCanvas;
    const width = canvas.width;
    const height = canvas.height;

    const paddingLeft = 46;
    const paddingRight = 24;
    const paddingTop = 24;
    const paddingBottom = 40;

    ctx.clearRect(0, 0, width, height);
    if (temperatureHistory.length === 0) return;

    const dataMin = Math.min(...temperatureHistory);
    const dataMax = Math.max(...temperatureHistory);

    let minTemp = Math.floor(dataMin * 10) / 10 - 1.0;
    let maxTemp = Math.ceil(dataMax * 10) / 10 + 1.0;

    if (maxTemp - minTemp < 2) {
      const mid = (minTemp + maxTemp) / 2;
      minTemp = mid - 1;
      maxTemp = mid + 1;
    }

    const plotW = width - paddingLeft - paddingRight;
    const plotH = height - paddingTop - paddingBottom;
    const yFor = (t) => paddingTop + (maxTemp - t) * (plotH / (maxTemp - minTemp));
    const xFor = (i) => paddingLeft + (i / Math.max(1, maxDataPoints - 1)) * plotW;

    // grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const val = minTemp + (s / steps) * (maxTemp - minTemp);
      const y = yFor(val);
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(val.toFixed(1), paddingLeft - 6, y);
    }

    if (temperatureHistory.length > 1) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();

      temperatureHistory.forEach((temp, index) => {
        const x = xFor(index);
        const y = yFor(temp);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();

      // fill under curve
      const lastX = xFor(temperatureHistory.length - 1);
      ctx.lineTo(lastX, height - paddingBottom);
      ctx.lineTo(paddingLeft, height - paddingBottom);
      ctx.closePath();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      ctx.fill();

      // points
      ctx.fillStyle = '#2563eb';
      temperatureHistory.forEach((temp, index) => {
        const x = xFor(index);
        const y = yFor(temp);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    // y axis
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(paddingLeft, height - paddingBottom);
    ctx.stroke();
    // x axis
    ctx.beginPath();
    ctx.moveTo(paddingLeft, height - paddingBottom);
    ctx.lineTo(width - paddingRight, height - paddingBottom);
    ctx.stroke();
  }

  window.updateVolume = (decibelValue) => {
    const volumeElement = document.getElementById('volumeDecibel');
    const peakElement = document.getElementById('peakVolume');
    const avgElement = document.getElementById('avgVolume');
    const lastUpdatedElement = document.getElementById('lastUpdated');

    if (volumeElement) {
      volumeElement.textContent = decibelValue.toFixed(1);

      volumeHistory.push(decibelValue);
      timeHistory.push(new Date());

      if (volumeHistory.length > maxDataPoints) {
        volumeHistory.shift();
        timeHistory.shift();
      }

      drawChart();

      if (peakElement) {
        if (decibelValue > peakVolume || updateCount === 0) {
          peakVolume = decibelValue;
          peakElement.textContent = `${peakVolume.toFixed(1)}`;
        }
      }

      if (avgElement) {
        if (updateCount === 0) {
          averageVolume = decibelValue;
        } else {
          averageVolume = (averageVolume * 0.9 + decibelValue * 0.1);
        }
        avgElement.textContent = `${averageVolume.toFixed(1)}`;
      }

      if (lastUpdatedElement) {
        const now = new Date();
        lastUpdatedElement.textContent = now.toLocaleTimeString();
      }
      updateCount++;
    }
  };

  window.updateTemperature = (celsiusValue) => {
    const tempElement = document.getElementById('temperatureCurrent');
    const peakElement = document.getElementById('peakTemperature');
    const avgElement = document.getElementById('avgTemperature');
    const lastUpdatedElement = document.getElementById('tempLastUpdated');

    if (tempElement) {
      tempElement.textContent = celsiusValue.toFixed(1);

      temperatureHistory.push(celsiusValue);
      tempTimeHistory.push(new Date());

      if (temperatureHistory.length > maxDataPoints) {
        temperatureHistory.shift();
        tempTimeHistory.shift();
      }

      drawTemperatureChart();

      if (peakElement) {
        if (celsiusValue > peakTemperature || tempUpdateCount === 0) {
          peakTemperature = celsiusValue;
          peakElement.textContent = `${peakTemperature.toFixed(1)}`;
        }
      }

      if (avgElement) {
        if (tempUpdateCount === 0) {
          averageTemperature = celsiusValue;
        } else {
          averageTemperature = (averageTemperature * 0.9 + celsiusValue * 0.1);
        }
        avgElement.textContent = `${averageTemperature.toFixed(1)}`;
      }

      if (lastUpdatedElement) {
        const now = new Date();
        lastUpdatedElement.textContent = now.toLocaleTimeString();
      }
      tempUpdateCount++;
    }
  };
}

export default VisualDemo;