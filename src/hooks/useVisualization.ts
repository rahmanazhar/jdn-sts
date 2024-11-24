import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from '../utils/shaders';

export const useVisualization = (mountRef: React.RefObject<HTMLDivElement>, animationColor: string) => {
  const shaderMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    camera.position.z = 14;

    // Geometry and material setup
    const geometry = new THREE.IcosahedronGeometry(2, 10);
    const shaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0.0 },
        u_amplitude: { value: 0.0 },
        u_explosiveness: { value: 0.0 },
        u_avgVolume: { value: 0.0 },
        u_color1: { value: new THREE.Color(animationColor) },
        u_color2: { value: new THREE.Color(animationColor) },
      },
      wireframe: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    shaderMaterialRef.current = shaderMaterial;

    // Create sphere mesh
    const sphere = new THREE.Mesh(geometry, shaderMaterial);
    sphere.userData.clickable = true;
    scene.add(sphere);

    // Audio setup
    const initAudio = async () => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const newAnalyser = audioContextRef.current.createAnalyser();
        newAnalyser.fftSize = 256;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(newAnalyser);
        setAnalyser(newAnalyser);
      } catch (error) {
        console.error("Error accessing the microphone", error);
      }
    };

    // Initialize audio immediately
    initAudio();

    // Geometry update function
    const updateGeometry = (detail: number) => {
      const newGeometry = new THREE.IcosahedronGeometry(2, detail);
      sphere.geometry.dispose();
      sphere.geometry = newGeometry;
    };

    // Color update function
    const updateColor = (baseHue: number) => {
      const hueVariation = (Math.sin(shaderMaterial.uniforms.u_time.value) + 1) * 15;
      const hue = (baseHue + hueVariation) % 360;
      const color = new THREE.Color(`hsl(${hue}, 100%, 50%)`);
      shaderMaterial.uniforms.u_color1.value.set(color);
      shaderMaterial.uniforms.u_color2.value.set(color);
    };

    // Animation loop
    const animate = () => {
      const animationFrame = requestAnimationFrame(animate);
      shaderMaterial.uniforms.u_time.value += 0.01;

      if (analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedAverage = average / 255;

        // Define animation styles
        const calmAndSmooth = () => {
          shaderMaterial.uniforms.u_avgVolume.value = normalizedAverage;
          shaderMaterial.uniforms.u_amplitude.value = 1.0;
          shaderMaterial.uniforms.u_explosiveness.value = 0.6;
          updateColor(140); // Green
          updateGeometry(5); // 5 polygons
        };

        const moderate = () => {
          shaderMaterial.uniforms.u_avgVolume.value = normalizedAverage;
          shaderMaterial.uniforms.u_amplitude.value = Math.min(1.0 + normalizedAverage * 0.8, 0.5);
          shaderMaterial.uniforms.u_explosiveness.value = 0.8;
          updateColor(140); // Light Green
          updateGeometry(25); // 25 polygons
        };

        const sharpAndAggressive = () => {
          shaderMaterial.uniforms.u_avgVolume.value = normalizedAverage;
          shaderMaterial.uniforms.u_amplitude.value = Math.min(1.0 + normalizedAverage * 2.0, 2.0);
          shaderMaterial.uniforms.u_explosiveness.value = 1.2;
          updateColor(140); // Dark Green
          updateGeometry(30); // 30 polygons
        };

        // Choose animation style based on condition
        const animationStyle: number = 2; // Default to moderate
        switch (animationStyle) {
          case 1:
            calmAndSmooth();
            break;
          case 2:
            moderate();
            break;
          case 3:
            sharpAndAggressive();
            break;
          default:
            calmAndSmooth();
        }
      } else {
        shaderMaterial.uniforms.u_avgVolume.value = 0.0;
        shaderMaterial.uniforms.u_amplitude.value = 1.0;
        shaderMaterial.uniforms.u_explosiveness.value = 0.2;
      }

      renderer.render(scene, camera);
      return animationFrame;
    };

    const animationFrame = animate();

    // Click handler
    const onClick = async (event: MouseEvent) => {
      const canvas = renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(x, y);
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(scene.children);
      if (intersects.length > 0 && intersects[0].object.userData.clickable) {
        await initAudio();
      }
    };

    renderer.domElement.addEventListener('click', onClick);

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onClick);
      cancelAnimationFrame(animationFrame);
      mountRef.current?.removeChild(renderer.domElement);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [animationColor]);

  return {
    shaderMaterialRef,
    analyser
  };
};
