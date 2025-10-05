import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GenerateImage } from '@/api/integrations';

const VisualDemo = () => {
  const pillowCanvasRef = useRef(null);
  const headCanvasRef = useRef(null);
  const [rollDeg, setRollDeg] = useState(0);
  const rollDegRef = useRef(0);
  const [autoMode, setAutoMode] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hoveredSensor, setHoveredSensor] = useState(null);
  const [hoveredIntensity, setHoveredIntensity] = useState(0);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [newPillowImage, setNewPillowImage] = useState(null);
  
  const scenesRef = useRef({
    pillow: null,
    head: null
  });
  const autoAngleRef = useRef(0);
  const prefersReducedMotion = useRef(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    rollDegRef.current = rollDeg;
  }, [rollDeg]);

  const calculateSensorIntensities = (roll) => {
    const intensities = Array(8).fill(0);
    const absRoll = Math.abs(roll);
    
    if (absRoll < 8) {
      const centerIntensity = Math.max(0, 1 - absRoll / 8);
      intensities[3] = centerIntensity * 0.95;
      intensities[4] = centerIntensity;
    } else if (roll < 0) {
      const factor = Math.min(1, (absRoll - 8) / 22);
      intensities[0] = factor * 0.75;
      intensities[1] = factor;
      intensities[2] = factor * 0.85;
    } else {
      const factor = Math.min(1, (absRoll - 8) / 22);
      intensities[5] = factor * 0.85;
      intensities[6] = factor;
      intensities[7] = factor * 0.75;
    }
    
    return intensities;
  };

  const handleGenerateNewImage = async () => {
    setIsGeneratingImage(true);
    try {
      const result = await GenerateImage({
        prompt: "Ultra-realistic studio product photo of person lying completely face-up on white rectangular bed pillow. Back of head (occiput) rests flat at pillow center with natural neck angle. Face oriented upward toward ceiling (+Z axis). Pillow lies flat on XY plane. Person's torso parallel to pillow surface, shoulders perfectly level and horizontal, spine straight, no twist or tilt. Head positioned 3-5% lower on canvas so occiput aligns with pillow geometric center. Pillow is 20-30% wider than standard, white cotton/microfiber with quilted square pattern, light piping, rounded corners, soft realistic loft. Natural fabric compression under head weight, contact shadows, subtle creasing at head contact area. Clean white background, soft even studio lighting, realistic fabric texture, no plastic shine, professional medical/sleep study photography, 4K quality, straight-on framing."
      });
      setNewPillowImage(result.url);
    } catch (error) {
      console.error('Failed to generate image:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  useEffect(() => {
    if (!autoMode) return;
    
    const motionScale = prefersReducedMotion.current ? 0.5 : 1;
    let animationId;
    
    const animate = () => {
      autoAngleRef.current += 0.015 * speed * motionScale;
      const cycle = autoAngleRef.current % (Math.PI * 2);
      
      if (cycle < Math.PI / 2) {
        setRollDeg(0);
      } else if (cycle < Math.PI) {
        setRollDeg(-30 * Math.sin((cycle - Math.PI / 2) * 2) * motionScale);
      } else if (cycle < Math.PI * 1.5) {
        setRollDeg(0);
      } else {
        setRollDeg(30 * Math.sin((cycle - Math.PI * 1.5) * 2) * motionScale);
      }
      
      animationId = requestAnimationFrame(animate);
    };
    
    animate();
    return () => cancelAnimationFrame(animationId);
  }, [autoMode, speed]);

  useEffect(() => {
    if (!pillowCanvasRef.current) return;

    const container = pillowCanvasRef.current;
    const size = Math.min(container.clientWidth, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);
    scene.fog = new THREE.Fog(0xf8f9fa, 8, 15);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 7, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(5, 10, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 5, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe0f7ff, 0.3);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    const textureLoader = new THREE.TextureLoader();
    const pillowTexture = textureLoader.load('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e19bb594a865a11b5f51ec/1839cc8cf_image.png');
    pillowTexture.wrapS = THREE.RepeatWrapping;
    pillowTexture.wrapT = THREE.RepeatWrapping;
    pillowTexture.repeat.set(2, 1);

    const pillowGeometry = new THREE.BoxGeometry(8.1, 0.8, 3.5, 75, 20, 35);
    const positions = pillowGeometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = positions.getY(i);
      
      const absX = Math.abs(x);
      const absZ = Math.abs(z);
      const edgeDistX = (8.1 / 2) - absX;
      const edgeDistZ = (3.5 / 2) - absZ;
      
      const normalizedY = y / 0.4;
      
      if (normalizedY > 0) {
        const distFromCenter = Math.sqrt(x * x * 0.15 + z * z * 0.5);
        const dipFactor = Math.exp(-distFromCenter * 0.6);
        
        const edgeCurveX = Math.min(1, edgeDistX / 0.8);
        const edgeCurveZ = Math.min(1, edgeDistZ / 0.6);
        const edgeFactor = Math.pow(edgeCurveX * edgeCurveZ, 2);
        
        positions.setY(i, y * edgeFactor - dipFactor * 0.3 + edgeFactor * 0.08);
      } else {
        const edgeCurveX = Math.min(1, edgeDistX / 0.5);
        const edgeCurveZ = Math.min(1, edgeDistZ / 0.4);
        const bottomEdgeFactor = Math.pow(edgeCurveX * edgeCurveZ, 2);
        
        const bulgeFactor = (1 - bottomEdgeFactor) * 0.25;
        
        positions.setY(i, y * bottomEdgeFactor - bulgeFactor);
      }
    }
    
    positions.needsUpdate = true;
    pillowGeometry.computeVertexNormals();

    const pillowMaterial = new THREE.MeshStandardMaterial({
      map: pillowTexture,
      roughness: 0.85,
      metalness: 0.02,
      envMapIntensity: 0.2
    });

    const pillow = new THREE.Mesh(pillowGeometry, pillowMaterial);
    pillow.castShadow = true;
    pillow.receiveShadow = true;
    scene.add(pillow);

    const sensors = [];
    const sensorPositions = [
      { x: -1.4, z: 0, label: 1 },
      { x: -0.9, z: 0.5, label: 2 },
      { x: -0.9, z: -0.5, label: 3 },
      { x: 0, z: 0.3, label: 4 },
      { x: 0, z: -0.3, label: 5 },
      { x: 0.9, z: 0.5, label: 6 },
      { x: 0.9, z: -0.5, label: 7 },
      { x: 1.4, z: 0, label: 8 }
    ];

    sensorPositions.forEach((pos, i) => {
      const sensorGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 20);
      const sensorMaterial = new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0x14b8a6,
        emissiveIntensity: 0
      });

      const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
      sensor.position.set(pos.x, 0.45, pos.z);
      sensor.castShadow = true;
      sensor.userData = { 
        index: i, 
        baseY: 0.45,
        baseScale: 1,
        activationTime: 0,
        lastIntensity: 0
      };
      
      scene.add(sensor);
      sensors.push(sensor);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pos.label.toString(), 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const label = new THREE.Sprite(labelMaterial);
      label.scale.set(0.25, 0.25, 1);
      label.position.set(pos.x, 0.7, pos.z);
      scene.add(label);
    });

    const groundGeometry = new THREE.PlaneGeometry(25, 25);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.12 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(sensors);

      if (intersects.length > 0) {
        const index = intersects[0].object.userData.index;
        const intensities = calculateSensorIntensities(rollDegRef.current);
        setHoveredSensor(index);
        setHoveredIntensity(intensities[index]);
      } else {
        setHoveredSensor(null);
      }
    };

    renderer.domElement.addEventListener('mousemove', handleMouseMove);

    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const intensities = calculateSensorIntensities(rollDegRef.current);
      const currentTime = Date.now() * 0.001;

      sensors.forEach((sensor, i) => {
        const targetIntensity = intensities[i];
        
        if (targetIntensity > 0.3 && sensor.userData.lastIntensity < 0.3) {
          sensor.userData.activationTime = currentTime;
        }
        sensor.userData.lastIntensity = targetIntensity;

        const baseColor = new THREE.Color(0x6b7280);
        const activeColor = new THREE.Color(0x14b8a6);
        const color = baseColor.clone().lerp(activeColor, targetIntensity);
        
        sensor.material.color = color;
        sensor.material.emissive = activeColor;
        sensor.material.emissiveIntensity = targetIntensity * 0.8;
        
        const timeSinceActivation = currentTime - sensor.userData.activationTime;
        const pulsePhase = Math.sin(currentTime * 3 + i) * 0.012;
        const activationPulse = timeSinceActivation < 0.4 
          ? Math.sin(timeSinceActivation * 12) * 0.04 * (1 - timeSinceActivation / 0.4)
          : 0;
        
        sensor.position.y = sensor.userData.baseY + targetIntensity * 0.1 + pulsePhase * targetIntensity + activationPulse;
        sensor.scale.setScalar(1 + targetIntensity * 0.15 + activationPulse * 0.5);
      });

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

    scenesRef.current.pillow = { scene, camera, renderer, sensors };

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      pillowTexture.dispose();
    };
  }, []);

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

    const headGroup = new THREE.Group();

    const material = new THREE.MeshPhongMaterial({ 
      color: 0xe8d5c4,
      shininess: 30,
      flatShading: false
    });

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
        const dip = Math.exp(-dist * 0.5);
        
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
      currentRoll += (rollDegRef.current - currentRoll) * dampingFactor;
      
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
      container.removeChild(renderer.domElement);
      renderer.dispose();
      pillowTexture.dispose();
    };
  }, []);

  const getPositionLabel = () => {
    if (Math.abs(rollDeg) < 8) return 'Center';
    return rollDeg < 0 ? 'Left Turn' : 'Right Turn';
  };

  const sensorIntensities = calculateSensorIntensities(rollDeg);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100">
      <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200 px-6 py-4 shadow-sm relative z-50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold bg-gradient-to-r from-gray-800 to-teal-600 bg-clip-text text-transparent">
              Patient Sleep Position Monitor
            </h1>
            <p className="text-sm text-gray-600 mt-1">Real-time pressure distribution analysis</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleGenerateNewImage}
              disabled={isGeneratingImage}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg text-sm"
            >
              {isGeneratingImage ? 'Generating...' : 'Generate AI Reference'}
            </button>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-600">Current Position</div>
              <div className="flex items-center gap-2 justify-end">
                <div className="text-lg font-semibold text-teal-600">{getPositionLabel()}</div>
                {autoMode && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs font-medium text-gray-500">LIVE</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {newPillowImage && (
          <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
            <div className="flex items-center gap-4">
              <img src={newPillowImage} alt="Generated reference" className="w-32 h-24 object-cover rounded-lg shadow-md" />
              <div>
                <div className="text-sm font-semibold text-gray-800">AI-Generated Reference Image</div>
                <div className="text-xs text-gray-600 mt-1">Fixed collision: head rests ON TOP of pillow with realistic contact compression</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-5 p-5 overflow-hidden items-center justify-center relative z-10">
        <div className="w-full max-w-lg lg:max-w-none lg:flex-1 aspect-square bg-white rounded-2xl shadow-xl overflow-hidden relative border border-gray-200 z-20">
          <div className="absolute top-5 left-5 z-30 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-lg border border-gray-100">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Pressure Map</div>
            <div className="text-[10px] text-gray-500 mt-0.5">8-Point Sensor Array</div>
          </div>
          {hoveredSensor !== null && (
            <div className="absolute top-5 right-5 z-30 bg-white/95 backdrop-blur-md px-5 py-3 rounded-xl shadow-xl border border-teal-100">
              <div className="text-sm font-bold text-gray-800">
                Sensor {hoveredSensor + 1}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Pressure: <span className="font-semibold text-teal-600">{Math.round(hoveredIntensity * 100)}%</span>
              </div>
            </div>
          )}
          <div ref={pillowCanvasRef} className="w-full h-full flex items-center justify-center relative z-10" />
        </div>

        <div className="w-full max-w-lg lg:max-w-none lg:flex-1 aspect-square bg-white rounded-2xl shadow-xl overflow-hidden relative border border-gray-200 z-20">
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

      <div className="bg-white/95 backdrop-blur-sm border-t border-gray-200 px-6 py-6 shadow-2xl relative z-50">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setRollDeg(-30)}
              disabled={autoMode}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            >
              ← Left Turn
            </button>
            <button
              onClick={() => setRollDeg(0)}
              disabled={autoMode}
              className="px-8 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-xl hover:from-teal-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            >
              Center
            </button>
            <button
              onClick={() => setRollDeg(30)}
              disabled={autoMode}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            >
              Right Turn →
            </button>
          </div>

          <div className="bg-gradient-to-r from-gray-50 to-blue-50/50 rounded-xl p-4 border border-gray-200">
            <label className="flex items-center justify-between text-sm font-semibold text-gray-700 mb-3">
              <span>Manual Roll Adjustment</span>
              <span className="text-teal-600 text-base">{rollDeg.toFixed(1)}°</span>
            </label>
            <input
              type="range"
              min="-30"
              max="30"
              step="0.5"
              value={rollDeg}
              onChange={(e) => setRollDeg(parseFloat(e.target.value))}
              disabled={autoMode}
              className="w-full h-3 bg-gradient-to-r from-blue-200 via-teal-200 to-blue-200 rounded-full appearance-none cursor-pointer disabled:opacity-50 accent-teal-600"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #14b8a6 ${((rollDeg + 30) / 60) * 100}%, #d1d5db ${((rollDeg + 30) / 60) * 100}%, #3b82f6 100%)`
              }}
            />
          </div>

          <div className="flex items-center gap-6 pt-3 border-t border-gray-200">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                className="w-5 h-5 text-teal-600 rounded focus:ring-2 focus:ring-teal-500 cursor-pointer transition-all"
              />
              <span className="text-sm font-semibold text-gray-700 group-hover:text-teal-600 transition-colors">
                Auto Demo Mode
              </span>
            </label>

            {autoMode && (
              <div className="flex-1 max-w-xs bg-gradient-to-r from-gray-50 to-blue-50/50 rounded-lg p-3 border border-gray-200">
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Speed: <span className="text-teal-600">{speed.toFixed(1)}x</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                />
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Sensor Activity Monitor</div>
              <div className="flex gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-600">Left (1-3)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-teal-500"></div>
                  <span className="text-gray-600">Center (4-5)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-600">Right (6-8)</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2.5 justify-center">
              {sensorIntensities.map((intensity, i) => (
                <div key={i} className="text-center">
                  <div 
                    className="w-12 h-12 rounded-xl mx-auto mb-2 transition-all duration-300 flex items-center justify-center relative overflow-hidden shadow-lg"
                    style={{
                      backgroundColor: intensity > 0.1 
                        ? `rgb(${20 + intensity * 87}, ${184 - intensity * 54}, ${166 - intensity * 66})`
                        : 'rgb(107, 114, 128)',
                      boxShadow: intensity > 0.3 
                        ? `0 0 ${intensity * 20}px rgba(20, 184, 166, ${intensity * 0.8})` 
                        : 'none',
                      border: intensity > 0.5 ? '2px solid rgba(255,255,255,0.8)' : '2px solid rgba(255,255,255,0.2)',
                      transform: intensity > 0.5 ? 'scale(1.1)' : 'scale(1)'
                    }}
                  >
                    <span className="text-sm font-bold text-white drop-shadow-lg relative z-10">{i + 1}</span>
                    {intensity > 0.3 && (
                      <div 
                        className="absolute inset-0 bg-gradient-to-t from-teal-400/30 to-transparent animate-pulse"
                      />
                    )}
                  </div>
                  <div className="text-xs font-semibold text-gray-700">{Math.round(intensity * 100)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualDemo;