
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProjectState } from '../types';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GoogleGenAI, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { generateProductRender } from '../services/geminiService';

const EnclosureView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>> }> = ({ state, setState }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [explode, setExplode] = useState(25);
  const [xRay, setXRay] = useState(false);
  
  // AI 相关状态
  const [aiInput, setAiInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiMessage, setAiMessage] = useState('我是结构 AI 助手。您可以告诉我：\n- "把外壳变得更圆一些"\n- "增加壁厚，让它更结实"\n- "把高度增加 10mm"');

  // 产品效果图状态
  const [renderImg, setRenderImg] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const lidGroupRef = useRef<THREE.Group | null>(null);
  const pcbGroupRef = useRef<THREE.Group | null>(null);
  const wallsMeshRef = useRef<THREE.Mesh | null>(null);
  const floorMeshRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const pcbW = state.pcbConstraints.width;
  const pcbH = state.pcbConstraints.height;

  const [params, setParams] = useState({
    thickness: 2.0,
    radius: 12.0,
    depth: 35.0,
    process: 'CNC',
    width: pcbW + 10,
    height: pcbH + 10,
  });

  useEffect(() => {
    setParams(prev => ({
      ...prev,
      width: Math.max(prev.width, pcbW + 2),
      height: Math.max(prev.height, pcbH + 2)
    }));
  }, [pcbW, pcbH]);

  const shellW = params.width;
  const shellH = params.height;

  // 根据当前方案 + 外壳参数,自动拼出工业设计 prompt 并生成效果图
  const handleGenerateRender = async () => {
    setIsRendering(true);
    setRenderError(null);
    setShowRenderModal(true);

    const comps = state.components || [];
    const hasOLED = comps.some((c: any) => /oled|lcd|display|屏/i.test(c.id + (c.name || '')));
    const hasKnob = comps.some((c: any) => /encoder|rotary|旋钮/i.test(c.id + (c.name || '')));
    const hasButton = comps.some((c: any) => /button|switch|按钮|key/i.test(c.id + (c.name || '')));
    const moduleNames = comps.filter((c: any) => c.type !== 'mcu').map((c: any) => c.name || c.id);

    const materialDesc = params.process === 'CNC' ? 'matte black anodized CNC aluminum' :
                         params.process === 'INJECTION' ? 'matte dark plastic' : 'matte 3D-printed';

    const features: string[] = [];
    if (hasOLED) features.push('a small rectangular OLED screen flush-mounted on the top face');
    if (hasKnob) features.push('one metal rotary knob');
    if (hasButton) features.push('a few tactile buttons');
    features.push('a USB-C port on one side');

    // 列出方案中真实模块,让不同方案产出不同外观
    const modList = moduleNames.length > 0 ? moduleNames.join(', ') : 'sensor modules';

    const appHint = (state as any).projectName || (state as any).intent || 'compact smart device';

    // 用户在「重新生成」时输入的改进要求
    const userRefine = refinePrompt.trim();

    // 截取当前 3D 画面作为参考图(图生图,保证形态一致)
    // A+C:截图前临时把外壳半透明/隐藏 + 抬高视角,让模块布局露出来
    let refImage: string | null = null;
    try {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (renderer && scene && camera) {
        // 1) 暂存外壳/盖子的可见性与不透明度,临时让它们半透明
        const saved: { mesh: THREE.Mesh; opacity: number; transparent: boolean }[] = [];
        scene.traverse((obj: any) => {
          if (obj.isMesh && (obj.name === 'shell' || obj.name === 'lid')) {
            const mat = obj.material;
            saved.push({ mesh: obj, opacity: mat.opacity, transparent: mat.transparent });
            mat.transparent = true;
            mat.opacity = 0.12; // 半透明,露出内部模块
            mat.needsUpdate = true;
          }
        });

        // 2) 暂存相机位置,临时抬高视角(更俯视,看清顶面布局)
        const savedPos = camera.position.clone();
        const dist = savedPos.length();
        camera.position.set(dist * 0.45, dist * 0.95, dist * 0.55);
        camera.lookAt(0, 0, 0);

        // 3) 渲染并截图
        renderer.render(scene, camera);
        refImage = renderer.domElement.toDataURL('image/png');

        // 4) 全部恢复
        camera.position.copy(savedPos);
        camera.lookAt(0, 0, 0);
        if (controlsRef.current) controlsRef.current.update();
        saved.forEach(s => {
          (s.mesh.material as any).opacity = s.opacity;
          (s.mesh.material as any).transparent = s.transparent;
          (s.mesh.material as any).needsUpdate = true;
        });
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.warn('canvas capture failed, fallback to text-only', err);
    }

    const refineClause = userRefine ? ` IMPORTANT user adjustment request: ${userRefine}.` : '';

    const prompt = refImage
      ? `Use this reference image as the layout guide. It shows the internal module placement (screen, knob, sensors, ports) of a hardware device with a semi-transparent enclosure. ` +
        `Render a photorealistic professional product shot of the FINISHED ASSEMBLED product (solid opaque enclosure, lid closed), keeping the SAME overall box shape, proportions, rounded corners, and the SAME top-face layout of components as shown. ` +
        `Material: ${materialDesc}, clean seamless finish (NO visible screws, NO exposed PCB, NO open windows, NO dimension annotations or text labels). ` +
        `On-board modules to represent on the surface (${modList}): ${features.join(', ')}. ` +
        `A ${appHint}. Studio lighting, soft neutral background, 3/4 angle, high detail, premium consumer electronics aesthetic. No text, no watermark, no measurement lines.${refineClause}`
      : `Professional industrial design product render, photorealistic, studio lighting, soft neutral background, 3/4 top-down angle. ` +
        `A compact ${appHint} electronic device with these modules: ${modList}. ` +
        `${materialDesc} seamless enclosure approximately ${Math.round(shellW)}×${Math.round(shellH)}×${Math.round(params.depth)}mm with ${params.radius}mm rounded corners. ` +
        `Features: ${features.join(', ')}. Clean premium aesthetic, NO screws, NO exposed PCB, NO dimension labels, no text watermark.${refineClause}`;

    const result = await generateProductRender(prompt, refImage || undefined);
    if (result.image) {
      setRenderImg(result.image);
    } else {
      setRenderError(result.error || '生成失败,请重试。');
    }
    setIsRendering(false);
  };

  const handleAiAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiThinking) return;
    setIsAiThinking(true);
    const userInput = aiInput;
    setAiInput('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        当前外壳参数: ${JSON.stringify(params)}
        用户要求: ${userInput}
        请以 JSON 格式返回修改后的参数（只返回需要修改的字段）。
        此外，用一段话解释你的修改理由（中文）。
      `;

      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              explanation: { type: Type.STRING },
              updates: {
                type: Type.OBJECT,
                properties: {
                  thickness: { type: Type.NUMBER },
                  radius: { type: Type.NUMBER },
                  depth: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(result.text);
      if (data.updates) setParams(prev => ({ ...prev, ...data.updates }));
      setAiMessage(data.explanation || "参数已更新。");
    } catch (e) {
      setAiMessage("抱歉，我无法理解该结构调整请求。");
    } finally {
      setIsAiThinking(false);
    }
  };

  const mappedComponents = useMemo(() => {
    return state.components.map(comp => {
      const isMcu = comp.type === 'mcu';
      const cw = isMcu ? 21 : 16;
      const ch = isMcu ? 20 : 16;
      // Convert layout pixel positions (based on FOOTPRINT_SCALE = 5) to millimeters (1mm = 5px)
      const rawX = (comp.pcbX !== undefined ? comp.pcbX : (comp.x || 0)) / 5;
      const rawY = (comp.pcbY !== undefined ? comp.pcbY : (comp.y || 0)) / 5;
      const posX = Math.max(cw/2, Math.min(pcbW - cw/2, rawX)) - pcbW/2;
      const posZ = Math.max(ch/2, Math.min(pcbH - ch/2, rawY)) - pcbH/2;
      return { ...comp, posX, posZ, cw, ch, depth: isMcu ? 4 : 3 };
    });
  }, [state.components, pcbW, pcbH]);

  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 5000);
    camera.position.set(220, 220, 220);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(150, 350, 150);
    sun.castShadow = true;
    scene.add(sun);

    const pcbGroup = new THREE.Group();
    scene.add(pcbGroup);
    pcbGroupRef.current = pcbGroup;

    const lidGroup = new THREE.Group();
    scene.add(lidGroup);
    lidGroupRef.current = lidGroup;

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    const timer = setTimeout(handleResize, 100);
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(timer); };
  }, [isFullscreen]);

  const createRoundedRectShape = (w: number, h: number, r: number) => {
    const shape = new THREE.Shape();
    const x = -w/2, y = -h/2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  };

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    [wallsMeshRef.current, floorMeshRef.current].forEach(m => {
      if (m) { m.geometry.dispose(); scene.remove(m); }
    });
    if (lidGroupRef.current) {
      lidGroupRef.current.children.forEach(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
      lidGroupRef.current.clear();
    }

    const baseColor = params.process === 'CNC' ? 0x94a3b8 : (params.process === 'INJECTION' ? 0x1e293b : 0xffffff);
    const metalness = params.process === 'CNC' ? 0.9 : 0.1;
    const roughness = params.process === '3D_PRINT' ? 0.7 : (params.process === 'CNC' ? 0.15 : 0.05);

    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: baseColor, metalness, roughness, clearcoat: 1.0, opacity: xRay ? 0.1 : 1.0, transparent: true
    });

    const trayDepth = params.depth * 0.75;
    const wallShape = createRoundedRectShape(shellW, shellH, params.radius);
    const innerR = Math.max(0, params.radius - params.thickness);
    const iw = shellW - params.thickness * 2;
    const ih = shellH - params.thickness * 2;
    
    const hole = new THREE.Path();
    hole.moveTo(-iw/2 + innerR, -ih/2);
    hole.lineTo(iw/2 - innerR, -ih/2);
    hole.quadraticCurveTo(iw/2, -ih/2, iw/2, -ih/2 + innerR);
    hole.lineTo(iw/2, ih/2 - innerR);
    hole.quadraticCurveTo(iw/2, ih/2, iw/2 - innerR, ih/2);
    hole.lineTo(-iw/2 + innerR, ih/2);
    hole.quadraticCurveTo(-iw/2, ih/2, -iw/2, ih/2 - innerR);
    hole.lineTo(-iw/2, -ih/2 + innerR);
    hole.quadraticCurveTo(-iw/2, -ih/2, -iw/2 + innerR, -ih/2);
    wallShape.holes.push(hole);

    const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: trayDepth, bevelEnabled: false });
    const walls = new THREE.Mesh(wallGeo, shellMaterial);
    walls.rotation.x = Math.PI / 2;
    walls.position.y = trayDepth/2;
    walls.name = 'shell';
    scene.add(walls);
    wallsMeshRef.current = walls;

    const floorGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(shellW, shellH, params.radius), { depth: params.thickness, bevelEnabled: false });
    const floor = new THREE.Mesh(floorGeo, shellMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -trayDepth/2;
    floor.name = 'shell';
    scene.add(floor);
    floorMeshRef.current = floor;

    const lidDepth = params.depth * 0.25;
    const isTransparentProcess = params.process === '3D_PRINT' || params.process === 'INJECTION';
    
    const lidMat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      metalness: metalness, roughness: roughness,
      transmission: isTransparentProcess ? 0.6 : 0, 
      transparent: true, 
      opacity: xRay ? 0.05 : (isTransparentProcess ? 0.7 : 1.0),
      thickness: params.thickness,
      clearcoat: 1.0
    });

    const lidGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(shellW, shellH, params.radius), { 
      depth: lidDepth, 
      bevelEnabled: true, 
      bevelThickness: params.thickness * 0.5, 
      bevelSize: params.thickness * 0.5,
      bevelSegments: 5 
    });
    const lidMesh = new THREE.Mesh(lidGeo, lidMat);
    lidMesh.rotation.x = Math.PI / 2;
    lidMesh.name = 'lid';
    lidGroupRef.current?.add(lidMesh);

    const lipShape = createRoundedRectShape(iw - 0.5, ih - 0.5, innerR);
    const lipGeo = new THREE.ExtrudeGeometry(lipShape, { depth: params.thickness, bevelEnabled: false });
    const lipMesh = new THREE.Mesh(lipGeo, lidMat);
    lipMesh.rotation.x = Math.PI / 2;
    lipMesh.position.y = -params.thickness / 2;
    lidGroupRef.current?.add(lipMesh);

    lidGroupRef.current!.position.y = trayDepth + explode;

    // ========================================================
    // DYNAMIC 3D PCB & COMPONENT MULTI-MODULE DETAILED LAYOUT
    // ========================================================
    if (pcbGroupRef.current) {
      // Clean up previous geometries/materials recursively to prevent memory leaks
      const clearGroupOfMeshes = (grp: THREE.Group | THREE.Object3D) => {
        const toRemove: THREE.Object3D[] = [];
        grp.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          } else if (child instanceof THREE.Group) {
            clearGroupOfMeshes(child);
          }
          toRemove.push(child);
        });
        toRemove.forEach(r => grp.remove(r));
      };
      clearGroupOfMeshes(pcbGroupRef.current);

      // Build main green mother PCB
      const pcbHeightScale = 1.6;
      const pcbBoardGeo = new THREE.BoxGeometry(pcbW, pcbHeightScale, pcbH);
      const pcbBoardMat = new THREE.MeshStandardMaterial({
        color: 0x0f766e, // Premium dark cyan/green solder mask
        roughness: 0.28,
        metalness: 0.2,
      });
      const pcbBoardMesh = new THREE.Mesh(pcbBoardGeo, pcbBoardMat);
      pcbBoardMesh.position.set(0, 0, 0);
      pcbBoardMesh.receiveShadow = true;
      pcbBoardMesh.castShadow = true;
      pcbGroupRef.current.add(pcbBoardMesh);

      // Add silver screw holes on 4 corners with standoffs beneath
      const cornerOff = 4;
      const corners = [
        { x: -pcbW/2 + cornerOff, z: -pcbH/2 + cornerOff },
        { x: pcbW/2 - cornerOff, z: -pcbH/2 + cornerOff },
        { x: -pcbW/2 + cornerOff, z: pcbH/2 - cornerOff },
        { x: pcbW/2 - cornerOff, z: pcbH/2 - cornerOff }
      ];
      corners.forEach(corner => {
        // Metallic circular contacts on PCB
        const ringGeo = new THREE.RingGeometry(1.2, 2.2, 16);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.15, metalness: 0.85, side: THREE.DoubleSide });
        
        const ringTop = new THREE.Mesh(ringGeo, ringMat);
        ringTop.rotation.x = Math.PI / 2;
        ringTop.position.set(corner.x, pcbHeightScale/2 + 0.01, corner.z);
        pcbGroupRef.current?.add(ringTop);

        const ringBottom = ringTop.clone();
        ringBottom.position.y = -pcbHeightScale/2 - 0.01;
        pcbGroupRef.current?.add(ringBottom);

        // Cylinder standoff casing spacer underneath the motherboard
        const standoffHeight = 3.0;
        const standoffGeo = new THREE.CylinderGeometry(2, 2.4, standoffHeight, 12);
        const standoffMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.45 });
        const standoffMesh = new THREE.Mesh(standoffGeo, standoffMat);
        standoffMesh.position.set(corner.x, -pcbHeightScale/2 - standoffHeight/2, corner.z);
        pcbGroupRef.current?.add(standoffMesh);
      });

      // Render custom 3D hardware components on the PCB board
      mappedComponents.forEach(comp => {
        const compGroup = new THREE.Group();
        compGroup.position.set(comp.posX, pcbHeightScale/2, comp.posZ);

        // A. Draw a crisp white silkscreen visual outline on mother PCB under each module
        const outlineThickness = 0.08;
        const outlineBox = new THREE.BoxGeometry(comp.cw + 0.8, outlineThickness, comp.ch + 0.8);
        const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        const outlineMesh = new THREE.Mesh(outlineBox, outlineMat);
        outlineMesh.position.set(comp.posX, pcbHeightScale/2 + outlineThickness/2, comp.posZ);
        pcbGroupRef.current?.add(outlineMesh);

        // B. Module PCB substrate (typically thick fiber glass)
        const subThickness = 1.0;
        const subGeo = new THREE.BoxGeometry(comp.cw, subThickness, comp.ch);
        const isMcu = comp.type === 'mcu';
        const isDisplay = comp.type === 'display';
        const isSensor = comp.type === 'sensor';
        const isActuator = comp.type === 'actuator';

        const subColor = isMcu ? 0x090d16 : (isDisplay ? 0x111827 : (isSensor ? 0x1e3a8a : 0x064e3b));
        const subMat = new THREE.MeshStandardMaterial({ color: subColor, roughness: 0.35, metalness: 0.1 });
        const subMesh = new THREE.Mesh(subGeo, subMat);
        subMesh.position.y = subThickness / 2;
        subMesh.castShadow = true;
        subMesh.receiveShadow = true;
        compGroup.add(subMesh);

        // C. Characteristic chip & hardware layouts
        if (isMcu) {
          // Metal chip shield can for the central microcontroller
          const shieldW = comp.cw - 6;
          const shieldH = comp.ch - 8;
          const shieldThickness = 1.6;
          const shieldGeo = new THREE.BoxGeometry(shieldW, shieldThickness, shieldH);
          const shieldMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 });
          const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
          shieldMesh.position.set(0, subThickness + shieldThickness/2, 0);
          shieldMesh.castShadow = true;
          compGroup.add(shieldMesh);

          // USB-C metallic jack at the MCU edge (protruding slightly)
          const usbGeo = new THREE.BoxGeometry(5.2, 1.6, 5.5);
          const usbMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });
          const usbMesh = new THREE.Mesh(usbGeo, usbMat);
          usbMesh.position.set(0, subThickness + 0.8, -comp.ch/2 + 2.5);
          usbMesh.castShadow = true;
          compGroup.add(usbMesh);

          // Gold castellated solder pads on the side edges
          [-comp.cw/2 + 0.4, comp.cw/2 - 0.4].forEach(xSide => {
            const steps = 7;
            for (let i = 0; i < steps; i++) {
              const zCoord = -comp.ch/2 + 3 + i * ((comp.ch - 6) / (steps - 1));
              const goldGeo = new THREE.BoxGeometry(1.0, 0.1, 0.8);
              const goldMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.85, roughness: 0.15 });
              const goldMesh = new THREE.Mesh(goldGeo, goldMat);
              goldMesh.position.set(xSide, subThickness + 0.05, zCoord);
              compGroup.add(goldMesh);
            }
          });

          // Bright green power pulsing LED indicator
          const ledGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
          const ledMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 1.5 });
          const ledMesh = new THREE.Mesh(ledGeo, ledMat);
          ledMesh.position.set(comp.cw/2 - 2.5, subThickness + 0.2, -comp.ch/2 + 3.5);
          compGroup.add(ledMesh);

        } else if (isDisplay) {
          // Glossy OLED/LCD screen panel glass
          const dispW = comp.cw - 2;
          const dispH = comp.ch - 4;
          const dispHeight = 1.2;
          const glassGeo = new THREE.BoxGeometry(dispW, dispHeight, dispH);
          const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x020617, roughness: 0.04, metalness: 0.9, clearcoat: 1.0 });
          const glassMesh = new THREE.Mesh(glassGeo, glassMat);
          glassMesh.position.set(0, subThickness + dispHeight/2, 0);
          glassMesh.castShadow = true;
          compGroup.add(glassMesh);

          // Glowing OLED horizontal text pixels (cyan color)
          const activeGlowColor = 0x38bdf8;
          const activeEmissive = 0x0284c7;
          
          const textLineGeo = new THREE.BoxGeometry(dispW - 4, 0.15, 1.2);
          const textLineMat = new THREE.MeshStandardMaterial({ color: activeGlowColor, emissive: activeEmissive, emissiveIntensity: 2.2 });
          
          const line1 = new THREE.Mesh(textLineGeo, textLineMat);
          line1.position.set(0, subThickness + dispHeight + 0.08, -3);
          compGroup.add(line1);

          const line2 = new THREE.Mesh(textLineGeo, textLineMat);
          line2.position.set(0, subThickness + dispHeight + 0.08, 0);
          compGroup.add(line2);

          const line3 = new THREE.Mesh(textLineGeo, textLineMat);
          line3.position.set(-comp.cw/4, subThickness + dispHeight + 0.08, 3);
          compGroup.add(line3);

        } else if (isSensor) {
          // Signature White Grove 4-pin Sensor Port
          const connW = 5.2;
          const connH = 4.2;
          const connD = 4.5;
          const connGeo = new THREE.BoxGeometry(connW, connH, connD);
          const connMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
          const connMesh = new THREE.Mesh(connGeo, connMat);
          connMesh.position.set(0, subThickness + connH/2, comp.ch/2 - connD/2 - 1);
          connMesh.castShadow = true;
          compGroup.add(connMesh);

          // Sub-elements for distinct sensor types
          const nameLower = comp.name.toLowerCase();
          if (nameLower.includes('temp') || nameLower.includes('bme280') || nameLower.includes('humid')) {
            // Environmental metal sensing capsule with slits
            const capGeo = new THREE.BoxGeometry(4.5, 2.5, 4.5);
            const capMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
            const capMesh = new THREE.Mesh(capGeo, capMat);
            capMesh.position.set(0, subThickness + 1.25, -comp.ch/4);
            capMesh.castShadow = true;
            compGroup.add(capMesh);

            const slotGeo = new THREE.BoxGeometry(0.6, 0.1, 3.2);
            const slotMat = new THREE.MeshBasicMaterial({ color: 0x18181b });
            for (let sOff = -1.2; sOff <= 1.2; sOff += 1.2) {
              const sm = new THREE.Mesh(slotGeo, slotMat);
              sm.position.set(sOff, subThickness + 2.5 + 0.02, -comp.ch/4);
              compGroup.add(sm);
            }
          } else if (nameLower.includes('light') || nameLower.includes('lux') || nameLower.includes('opt')) {
            // Semi-spherical transparent light receiver dome
            const domeGeo = new THREE.SphereGeometry(1.6, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
            const domeMat = new THREE.MeshPhysicalMaterial({ color: 0x0ea5e9, transmission: 0.9, roughness: 0.1, transparent: true, opacity: 0.8 });
            const domeMesh = new THREE.Mesh(domeGeo, domeMat);
            domeMesh.position.set(0, subThickness, -comp.ch/4);
            compGroup.add(domeMesh);
          } else if (nameLower.includes('vision') || nameLower.includes('cam')) {
            // Standard smart camera barrel lens unit
            const lensBarrelGeo = new THREE.CylinderGeometry(3.5, 3.5, 4.0, 16);
            const lensBarrelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45 });
            const lensBarrel = new THREE.Mesh(lensBarrelGeo, lensBarrelMat);
            lensBarrel.rotation.x = Math.PI / 2;
            lensBarrel.position.set(0, subThickness + 2.0, -comp.ch/4);
            lensBarrel.castShadow = true;
            compGroup.add(lensBarrel);

            // Brass outer filter ring
            const rGeo = new THREE.TorusGeometry(2.4, 0.5, 8, 16);
            const rMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.1 });
            const brassRing = new THREE.Mesh(rGeo, rMat);
            brassRing.position.set(0, subThickness + 2.0, -comp.ch/4 + 2.01);
            compGroup.add(brassRing);

            // Deep blue reflective lens window
            const lensGlassGeo = new THREE.SphereGeometry(1.8, 12, 12);
            const lensGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x172554, roughness: 0.01, transmission: 0.95, clearcoat: 1.0 });
            const lensGlass = new THREE.Mesh(lensGlassGeo, lensGlassMat);
            lensGlass.position.set(0, subThickness + 2.0, -comp.ch/4 + 1.8);
            compGroup.add(lensGlass);
          } else {
            // Standard small SMD integrated chip package
            const chipGeo = new THREE.BoxGeometry(3.2, 1.2, 3.2);
            const chipMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
            const chipMesh = new THREE.Mesh(chipGeo, chipMat);
            chipMesh.position.set(0, subThickness + 0.6, -comp.ch/4);
            chipMesh.castShadow = true;
            compGroup.add(chipMesh);

            const dotGeo = new THREE.SphereGeometry(0.3, 8, 8);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const dotMesh = new THREE.Mesh(dotGeo, dotMat);
            dotMesh.position.set(-1.0, subThickness + 1.2 + 0.03, -comp.ch/4 - 1.0);
            compGroup.add(dotMesh);
          }

        } else if (isActuator) {
          // Signature White Grove 4-pin Port
          const connW = 5.2;
          const connH = 4.2;
          const connD = 4.5;
          const connGeo = new THREE.BoxGeometry(connW, connH, connD);
          const connMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
          const connMesh = new THREE.Mesh(connGeo, connMat);
          connMesh.position.set(0, subThickness + connH/2, comp.ch/2 - connD/2 - 1);
          connMesh.castShadow = true;
          compGroup.add(connMesh);

          const nameLower = comp.name.toLowerCase();
          if (nameLower.includes('relay')) {
            // Royal blue electromechanical relay cuboid casing
            const rLyW = comp.cw - 4;
            const rLyD = comp.ch - 6;
            const rLyH = 7.5;
            const relayGeo = new THREE.BoxGeometry(rLyW, rLyH, rLyD);
            const relayMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3, metalness: 0.1 });
            const relayMesh = new THREE.Mesh(relayGeo, relayMat);
            relayMesh.position.set(0, subThickness + rLyH/2, -2.5);
            relayMesh.castShadow = true;
            compGroup.add(relayMesh);

            // Three high power brass screw contacts
            const pinMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.95, roughness: 0.1 });
            for (let xPos = -rLyW/3; xPos <= rLyW/3 + 0.1; xPos += rLyW/3) {
              const pinGeo = new THREE.CylinderGeometry(0.6, 0.6, 2.0, 8);
              const pm = new THREE.Mesh(pinGeo, pinMat);
              pm.rotation.x = Math.PI / 2;
              pm.position.set(xPos, subThickness + rLyH/3, -2.5 - rLyD/2 - 0.3);
              compGroup.add(pm);
            }
          } else if (nameLower.includes('buzzer')) {
            // Circular solid black buzzer sound generator cylindrical body
            const buzzRad = Math.min(comp.cw, comp.ch) / 2 - 1.5;
            const buzzH = 6.0;
            const buzzGeo = new THREE.CylinderGeometry(buzzRad, buzzRad, buzzH, 24);
            const buzzMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 });
            const buzzMesh = new THREE.Mesh(buzzGeo, buzzMat);
            buzzMesh.position.set(0, subThickness + buzzH/2, -2.5);
            buzzMesh.castShadow = true;
            compGroup.add(buzzMesh);

            // Sound resonance emitting hole on top surface
            const innerHoleGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 12);
            const innerHoleMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const innerHoleMesh = new THREE.Mesh(innerHoleGeo, innerHoleMat);
            innerHoleMesh.position.set(0, subThickness + buzzH + 0.05, -2.5);
            compGroup.add(innerHoleMesh);

            // Polar marking
            const tGeo = new THREE.BoxGeometry(0.8, 0.1, 0.25);
            const tMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.8 });
            const tH = new THREE.Mesh(tGeo, tMat);
            tH.position.set(buzzRad - 2, subThickness + buzzH + 0.02, -1.0);
            const tV = tH.clone();
            tV.rotation.y = Math.PI / 2;
            compGroup.add(tH);
            compGroup.add(tV);
          } else if (nameLower.includes('led') || nameLower.includes('light')) {
            // Bright red epoxy status LED dome
            const bulbGeo = new THREE.SphereGeometry(1.8, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
            const bulbMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 2.0 });
            const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
            bulbMesh.position.set(0, subThickness + 0.4, -2.5);
            compGroup.add(bulbMesh);
          } else {
            // Generic dynamic physical controller actuator terminal blocks (green)
            const capGeo = new THREE.BoxGeometry(comp.cw - 4, 4.5, 5.0);
            const capMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.4 });
            const capMesh = new THREE.Mesh(capGeo, capMat);
            capMesh.position.set(0, subThickness + 2.25, -2.5);
            capMesh.castShadow = true;
            compGroup.add(capMesh);
          }
        } else {
          // Standard generic board component
          const blkGeo = new THREE.BoxGeometry(comp.cw - 4, 3.0, comp.ch - 6);
          const blkMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
          const blkMesh = new THREE.Mesh(blkGeo, blkMat);
          blkMesh.position.set(0, subThickness + 1.5, -2.0);
          blkMesh.castShadow = true;
          compGroup.add(blkMesh);
        }

        pcbGroupRef.current?.add(compGroup);
      });

      // Align and standoff clearance: place PCB inside lower container tray
      const standoffHeight = 3.0;
      const pcbYPos = -trayDepth / 2 + params.thickness + standoffHeight + pcbHeightScale / 2 + (explode * 0.4);
      pcbGroupRef.current.position.y = pcbYPos;
    }

  }, [params, shellW, shellH, xRay, mappedComponents]);

  // Lightweight position update for explosion split visualization to guarantee 60fps performance
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const trayDepth = params.depth * 0.75;
    const pcbHeightScale = 1.6;
    const standoffHeight = 3.0;

    if (lidGroupRef.current) {
      lidGroupRef.current.position.y = trayDepth + explode;
    }
    if (pcbGroupRef.current) {
      const pcbYPos = -trayDepth / 2 + params.thickness + standoffHeight + pcbHeightScale / 2 + (explode * 0.4);
      pcbGroupRef.current.position.y = pcbYPos;
    }
  }, [explode, params.depth, params.thickness]);

  const ControlPanel = ({ floating = false }) => (
    <div className={`${floating ? 'bg-slate-900/90 backdrop-blur-3xl border border-slate-700/50 text-white p-10 rounded-[48px] shadow-3xl w-96 ring-1 ring-white/10' : 'bg-white p-8 rounded-[48px] border border-slate-200 shadow-sm'} space-y-8 transition-all duration-500 overflow-y-auto max-h-[80vh] scrollbar-hide`}>
      <div className="space-y-6">
        <h4 className={`text-xs font-black uppercase tracking-widest flex items-center gap-3 ${floating ? 'text-indigo-400' : 'text-slate-800'}`}>
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
          壳体物理规格调节
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-tight text-slate-400">制造工艺</label>
            <div className="relative group">
              <select 
                value={params.process} 
                onChange={(e) => setParams(s => ({...s, process: e.target.value}))}
                className="w-full appearance-none rounded-2xl p-4 text-xs font-black outline-none border transition-all bg-slate-900 border-slate-700 text-white ring-offset-2 ring-indigo-500/0 focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="CNC">CNC 铝合金</option>
                <option value="3D_PRINT">3D 打印 (SLS)</option>
                <option value="INJECTION">工业注塑 (ABS)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[10px] group-hover:scale-125 transition-transform">▼</div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-tight text-slate-400">壁厚 (T)</label>
            <div className="relative group">
              <select 
                value={params.thickness} 
                onChange={(e) => setParams(s => ({...s, thickness: +e.target.value}))}
                className="w-full appearance-none rounded-2xl p-4 text-xs font-black outline-none border transition-all bg-slate-900 border-slate-700 text-white ring-offset-2 ring-indigo-500/0 focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value={1.5}>1.5 mm (Thin)</option>
                <option value={2.0}>2.0 mm (Standard)</option>
                <option value={3.0}>3.0 mm (Rugged)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[10px] group-hover:scale-125 transition-transform">▼</div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
             <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black uppercase tracking-tight text-slate-400">外框宽度 (Width)</label>
                <span className="text-[10px] font-mono font-bold text-indigo-500">{params.width}mm</span>
             </div>
             <input type="range" min={pcbW + 2} max={pcbW + 60} step="0.5" value={params.width} onChange={(e) => setParams(s => ({...s, width: +e.target.value}))} className="w-full h-1.5 bg-slate-700 rounded-full appearance-none accent-indigo-600 cursor-ew-resize" />
          </div>

          <div className="space-y-2">
             <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black uppercase tracking-tight text-slate-400">外框长度 (Height)</label>
                <span className="text-[10px] font-mono font-bold text-indigo-500">{params.height}mm</span>
             </div>
             <input type="range" min={pcbH + 2} max={pcbH + 60} step="0.5" value={params.height} onChange={(e) => setParams(s => ({...s, height: +e.target.value}))} className="w-full h-1.5 bg-slate-700 rounded-full appearance-none accent-indigo-600 cursor-ew-resize" />
          </div>

          <div className="space-y-2">
             <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black uppercase tracking-tight text-slate-400">圆角半径 (Corner)</label>
                <span className="text-[10px] font-mono font-bold text-indigo-500">{params.radius}mm</span>
             </div>
             <input type="range" min="0" max="30" step="0.5" value={params.radius} onChange={(e) => setParams(s => ({...s, radius: +e.target.value}))} className="w-full h-1.5 bg-slate-700 rounded-full appearance-none accent-indigo-600 cursor-ew-resize" />
          </div>
          
          <div className="space-y-2">
             <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black uppercase tracking-tight text-slate-400">腔体高度 (Height)</label>
                <span className="text-[10px] font-mono font-bold text-indigo-500">{params.depth}mm</span>
             </div>
             <input type="range" min="20" max="80" step="1" value={params.depth} onChange={(e) => setParams(s => ({...s, depth: +e.target.value}))} className="w-full h-1.5 bg-slate-700 rounded-full appearance-none accent-indigo-600 cursor-ew-resize" />
          </div>
        </div>

        {/* 局部集成：结构 AI 助手 */}
        <div className="bg-indigo-600 rounded-[32px] p-6 text-white space-y-4 shadow-xl border border-white/10">
           <div className="flex items-center gap-3">
              <span className="text-xl">🤖</span>
              <span className="text-[10px] font-black uppercase tracking-widest">结构 AI 助手</span>
              {isAiThinking && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
           </div>
           <div className="text-[10px] font-medium leading-relaxed opacity-80 bg-black/20 p-4 rounded-2xl">
              <ReactMarkdown>{aiMessage}</ReactMarkdown>
           </div>
           <form onSubmit={handleAiAction} className="relative">
              <input 
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="尝试自然语言微调结构..."
                className="w-full bg-white/10 border border-white/10 rounded-xl py-3 pl-4 pr-10 text-[10px] font-bold outline-none focus:ring-2 focus:ring-white/20"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>
           </form>
        </div>
      </div>
    </div>
  );

  const ExplosionControl = ({ floating = false }) => (
    <div className={`flex items-center gap-10 px-12 py-8 transition-all duration-700 ${floating ? 'bg-white/95 backdrop-blur-3xl rounded-[48px] shadow-3xl border border-white/50 w-[700px]' : 'bg-white rounded-[40px] border border-slate-100 shadow-sm w-full mt-8'}`}>
      <div className="flex-1 flex flex-col">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">爆炸视图拆解 (Explosion)</span>
        <input type="range" min="0" max="150" value={explode} onChange={(e) => setExplode(+e.target.value)} className="w-full h-2 bg-slate-100 rounded-full appearance-none accent-indigo-600 cursor-ew-resize" />
      </div>
      <div className="w-[2px] h-12 bg-slate-200" />
      <div className="flex gap-10 whitespace-nowrap">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">外框尺寸</div>
          <div className="text-lg font-black text-slate-800">{params.width}×{params.height} <span className="text-[10px] text-slate-400 font-mono ml-1">mm</span></div>
        </div>
        {(isFullscreen || !floating) && (
          <div className="text-center animate-in fade-in duration-1000">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">活跃组件</div>
            <div className="text-lg font-black text-slate-800">{state.components.length} <span className="text-[10px] text-indigo-500 ml-1 tracking-tighter">Units</span></div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`min-h-full transition-all duration-500 ${isFullscreen ? 'fixed inset-0 z-[100] bg-slate-950' : 'bg-ink-50 p-5'}`}>
      {/* 产品效果图弹窗 */}
      {showRenderModal && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => !isRendering && setShowRenderModal(false)}>
          <div className="bg-white rounded-eng-xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-200">
              <h3 className="text-strong text-ink-900 flex items-center gap-2">AI 产品效果图 <span className="text-meta font-mono text-brand-600 border border-brand-200 bg-brand-50 px-1.5 py-0.5 rounded-eng">Nano Banana</span></h3>
              <button onClick={() => !isRendering && setShowRenderModal(false)} className="text-ink-400 hover:text-ink-700 text-lg" disabled={isRendering}>✕</button>
            </div>
            <div className="p-5">
              {isRendering ? (
                <div className="aspect-[4/3] flex flex-col items-center justify-center gap-3 text-ink-400">
                  <div className="w-10 h-10 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
                  <div className="text-body">正在根据当前外壳与模块生成效果图…</div>
                  <div className="text-meta">约 5-15 秒</div>
                </div>
              ) : renderError ? (
                <div className="aspect-[4/3] flex flex-col items-center justify-center gap-3 text-center">
                  <div className="text-body text-red-500">{renderError}</div>
                  <button onClick={handleGenerateRender} className="px-4 py-2 bg-brand-600 text-white rounded-eng text-body font-semibold hover:bg-brand-700">重试</button>
                </div>
              ) : renderImg ? (
                <div className="space-y-3">
                  <img src={renderImg} alt="产品效果图" className="w-full rounded-eng-lg border border-ink-200" />
                  <div>
                    <label className="text-meta text-ink-500 block mb-1">想改进哪里?(可选,填写后点"重新生成")</label>
                    <input
                      type="text"
                      value={refinePrompt}
                      onChange={(e) => setRefinePrompt(e.target.value)}
                      placeholder='如:外壳改成白色 / 旋钮再大一点 / 正面加扬声器开孔'
                      className="w-full bg-ink-50 border border-ink-200 rounded-eng px-3 py-2 text-body text-ink-800 placeholder:text-ink-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateRender(); }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <a href={renderImg} download="product-render.png" className="flex-1 text-center px-4 py-2 bg-brand-600 text-white rounded-eng text-body font-semibold hover:bg-brand-700">下载图片</a>
                    <button onClick={handleGenerateRender} className="px-4 py-2 bg-white border border-brand-300 text-brand-700 rounded-eng text-body font-semibold hover:bg-brand-50">重新生成</button>
                  </div>
                  <p className="text-meta text-ink-400">效果图由 AI 根据外壳参数、模块清单与你的改进要求生成,仅供概念展示,非最终产品外观。</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {!isFullscreen && (
        <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between gap-6">
          <div>
            <h2 className="text-h2 text-ink-900 flex items-center gap-2.5">
               工业设计与仿真 <span className="text-brand-600 text-meta font-mono font-medium border border-brand-200 bg-brand-50 px-2 py-0.5 rounded-eng">Engine v2.5</span>
            </h2>
            <p className="text-body text-ink-500 mt-1">物理精准度 ±0.1mm · 通过 WebGL 实时仿真外壳结构与内部干涉</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleGenerateRender}
              className="px-4 py-2.5 bg-white border border-brand-300 text-brand-700 rounded-eng-lg text-body font-semibold hover:bg-brand-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>生成效果图</span>
            </button>
            <button 
              onClick={() => setState(p => ({ ...p, currentStep: 4 }))}
              className="px-4 py-2.5 bg-brand-600 text-white rounded-eng-lg text-body font-semibold hover:bg-brand-700 transition-colors flex items-center gap-1.5"
            >
              <span>进入仿真校验</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
            </button>
            <button className="px-4 py-2.5 bg-ink-800 text-white rounded-eng-lg text-body font-semibold hover:bg-ink-900 transition-colors">
                导出 STEP 制造文件
            </button>
          </div>
        </div>
      )}

      <div className={`h-full ${isFullscreen ? 'relative w-full' : 'grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto'}`}>
        <div className={`${isFullscreen ? 'w-full h-full' : 'lg:col-span-8 flex flex-col'}`}>
          <div className={`relative bg-white shadow-3xl overflow-hidden transition-all duration-700 ${isFullscreen ? 'w-full h-full rounded-none bg-transparent shadow-none' : 'w-full aspect-[16/10] rounded-[48px] border-8 border-white'}`}>
            <div ref={mountRef} className="w-full h-full" />
            
            {isFullscreen && (
              <div className="absolute top-10 left-10 animate-in fade-in slide-in-from-left-8 duration-500">
                <ControlPanel floating={true} />
              </div>
            )}

            <div className={`absolute flex flex-col gap-4 ${isFullscreen ? 'top-10 right-10' : 'top-8 right-8'}`}>
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="w-16 h-16 bg-white/95 backdrop-blur rounded-full flex items-center justify-center shadow-2xl border border-slate-100 hover:scale-110 active:scale-95 transition-all group z-[110]">
                <svg className="w-8 h-8 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">{isFullscreen ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 9L4 4m0 0h4M4 4v4m11 1l5-5m0 0h-4m4 0v4M9 15l-5 5m0 0h4m-4 0v-4m11-1l5 5m0 0h-4m4 0v-4" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />}</svg>
              </button>
              <button onClick={() => setXRay(!xRay)} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl border transition-all z-[110] ${xRay ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-800 border-slate-100'}`}>
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
            </div>

            {isFullscreen && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
                <ExplosionControl floating={true} />
              </div>
            )}
          </div>

          {!isFullscreen && (
            <ExplosionControl floating={false} />
          )}
        </div>

        {!isFullscreen && (
          <div className="lg:col-span-4 space-y-6">
            <ControlPanel />
            <div className="p-10 bg-slate-900 rounded-[48px] text-white shadow-3xl border border-white/5 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-500/20 transition-all duration-1000" />
               <div className="relative z-10 flex items-center gap-5 mb-8">
                  <div className="w-14 h-14 bg-white/10 rounded-[22px] flex items-center justify-center text-3xl shadow-inner">⚡</div>
                  <div>
                     <h4 className="text-sm font-black uppercase tracking-widest leading-none mb-1">物理约束分析</h4>
                     <div className="text-[10px] text-indigo-400 font-black tracking-widest">REAL-TIME VALIDATION</div>
                  </div>
               </div>
               <p className="text-xs leading-relaxed font-medium text-slate-400 mb-8 italic">"正在进行 DFM (面向制造的设计) 检查。当前圆角半径较大，注塑脱模率预估：优秀。"</p>
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 bg-white/5 rounded-3xl border border-white/5 text-center">
                     <div className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">热负载预估</div>
                     <div className="text-lg font-black text-green-500">LOW</div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnclosureView;
