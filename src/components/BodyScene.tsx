
import React, { Suspense, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Protocol, StingPoint } from '../types';
import { DEMO_HUMAN_MODEL_URL } from '../constants';
import StingPointMarker from './StingPointMarker';

interface BodySceneProps {
  protocol: Protocol | null;
  onPointSelect: (point: StingPoint) => void;
  activePointId: string | null;
  isRolling: boolean;
}

const HumanModel = ({ url }: { url: string }) => {
  const { scene } = useGLTF(url);
  
  useMemo(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        if (mesh.material) {
          const mat = new THREE.MeshStandardMaterial({
            color: '#e2e8f0', // Brighter medical white-grey
            roughness: 0.6,
            metalness: 0.1,
            flatShading: false
          });
          mesh.material = mat;
        }
      }
    });

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    const targetHeight = 1.8;
    const scale = targetHeight / size.y;
    scene.scale.setScalar(scale);
    
    scene.position.x = -center.x * scale;
    scene.position.y = -box.min.y * scale; 
    scene.position.z = -center.z * scale;
  }, [scene]);

  return <primitive object={scene} />;
};

const LoadingOverlay = () => (
  <Html center>
    <div className="flex flex-col items-center gap-4 whitespace-nowrap">
      <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="bg-white/95 px-6 py-3 rounded-2xl border border-slate-200 shadow-2xl backdrop-blur-sm">
        <p className="text-slate-600 font-bold text-xs uppercase tracking-widest text-center">Loading Anatomy</p>
      </div>
    </div>
  </Html>
);

const BodyScene: React.FC<BodySceneProps> = ({ protocol, onPointSelect, activePointId, isRolling }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (isRolling && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.2, 4]} fov={40} />
      <OrbitControls 
        enablePan={false} 
        minDistance={1.2} 
        maxDistance={6} 
        target={[0, 1, 0]}
        makeDefault
      />
      
      <ambientLight intensity={1.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
      <directionalLight position={[-10, 5, 5]} intensity={0.8} />
      
      <Suspense fallback={<LoadingOverlay />}>
        <group ref={groupRef}>
          <HumanModel url={DEMO_HUMAN_MODEL_URL} />
          
          {protocol?.points.map((point) => (
            <StingPointMarker 
              key={point.id} 
              point={point} 
              onClick={onPointSelect} 
              isHighlighted={activePointId === point.id}
            />
          ))}
        </group>
        
        <Environment preset="city" />
        
        <ContactShadows 
          position={[0, 0, 0]}
          opacity={0.3} 
          scale={15} 
          blur={3} 
          far={10} 
          resolution={512} 
          color="#000000" 
        />
      </Suspense>
      
      <gridHelper args={[20, 50, 0xe2e8f0, 0xf1f5f9]} position={[0, -0.01, 0]} />
    </>
  );
};

export default BodyScene;
