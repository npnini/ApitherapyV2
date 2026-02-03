
import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import { StingPoint, Protocol } from '../types/apipuncture';

// Fix: Defining Three.js elements as components to resolve JSX intrinsic element type errors (e.g., Property 'group' does not exist on type 'JSX.IntrinsicElements')
const Group = 'group' as any;
const Mesh = 'mesh' as any;
const SphereGeometry = 'sphereGeometry' as any;
const MeshStandardMaterial = 'meshStandardMaterial' as any;
const CapsuleGeometry = 'capsuleGeometry' as any;
const AmbientLight = 'ambientLight' as any;
const PointLight = 'pointLight' as any;
const SpotLight = 'spotLight' as any;
const PlaneGeometry = 'planeGeometry' as any;
const GridHelper = 'gridHelper' as any;

interface PointProps {
  point: StingPoint;
  isApplied: boolean;
  isRecommended: boolean;
  onClick: (id: string) => void;
}

const Point: React.FC<PointProps> = ({ point, isApplied, isRecommended, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(
        1 + Math.sin(state.clock.elapsedTime * 4) * 0.1 + (hovered ? 0.2 : 0)
      );
    }
  });

  const color = isApplied ? '#22c55e' : (isRecommended ? '#ef4444' : '#3b82f6');

  // Fix: Replaced lowercase intrinsic tags with uppercase aliases to satisfy TypeScript checks
  return (
    <Group position={point.position}>
      <Mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClick(point.id);
        }}
      >
        <SphereGeometry args={[0.04, 32, 32]} />
        <MeshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={hovered ? 2.5 : 1} 
        />
      </Mesh>
      
      {(hovered || isApplied) && (
        <Html distanceFactor={10}>
          <div className="bg-black/80 text-white px-2 py-1 rounded text-[10px] whitespace-nowrap pointer-events-none border border-white/20">
            {point.label} {isApplied ? '✓' : ''}
          </div>
        </Html>
      )}
    </Group>
  );
};

// Simplified Humanoid Model using basic primitives
// Fix: Replaced lowercase intrinsic tags with uppercase aliases to satisfy TypeScript checks
const StylizedHuman = () => {
  return (
    <Group>
      {/* Torso */}
      <Mesh position={[0, 0.5, 0]}>
        <CapsuleGeometry args={[0.2, 1, 8, 16]} />
        <MeshStandardMaterial color="#f0f9ff" transparent opacity={0.4} />
      </Mesh>
      {/* Head */}
      <Mesh position={[0, 1.45, 0]}>
        <SphereGeometry args={[0.15, 32, 32]} />
        <MeshStandardMaterial color="#f0f9ff" transparent opacity={0.4} />
      </Mesh>
      {/* Left Arm */}
      <Mesh position={[0.4, 0.6, 0]} rotation={[0, 0, -Math.PI / 8]}>
        <CapsuleGeometry args={[0.07, 0.7, 4, 8]} />
        <MeshStandardMaterial color="#f0f9ff" transparent opacity={0.4} />
      </Mesh>
      {/* Right Arm */}
      <Mesh position={[-0.4, 0.6, 0]} rotation={[0, 0, Math.PI / 8]}>
        <CapsuleGeometry args={[0.07, 0.7, 4, 8]} />
        <MeshStandardMaterial color="#f0f9ff" transparent opacity={0.4} />
      </Mesh>
      {/* Left Leg */}
      <Mesh position={[0.15, -0.6, 0]}>
        <CapsuleGeometry args={[0.1, 1, 4, 8]} />
        <MeshStandardMaterial color="#f0f9ff" transparent opacity={0.4} />
      </Mesh>
      {/* Right Leg */}
      <Mesh position={[-0.15, -0.6, 0]}>
        <CapsuleGeometry args={[0.1, 1, 4, 8]} />
        <MeshStandardMaterial color="#f0f9ff" transparent opacity={0.4} />
      </Mesh>
    </Group>
  );
};

interface ModelContainerProps {
  protocol: Protocol;
  appliedPoints: string[];
  togglePoint: (id: string) => void;
  autoRotate: boolean;
}

// Fix: Replaced lowercase intrinsic tags with uppercase aliases for Three.js elements
const HumanModel: React.FC<ModelContainerProps> = ({ protocol, appliedPoints, togglePoint, autoRotate }) => {
  return (
    <div className="w-full h-[600px] bg-slate-900 rounded-2xl overflow-hidden relative border-4 border-slate-800 shadow-2xl">
      <div className="absolute top-4 left-4 z-10 space-y-2 pointer-events-none">
        <h3 className="text-white font-bold text-xl uppercase tracking-widest drop-shadow-md">Interactive Bio-Map</h3>
        <p className="text-slate-400 text-xs">Click dots to log applied treatment points</p>
      </div>

      <div className="absolute bottom-4 right-4 z-10 flex gap-4 text-[10px] font-bold">
        <div className="flex items-center gap-1 text-red-500">
           <div className="w-2 h-2 rounded-full bg-red-500" /> RECOMMENDED
        </div>
        <div className="flex items-center gap-1 text-green-500">
           <div className="w-2 h-2 rounded-full bg-green-500" /> APPLIED
        </div>
        <div className="flex items-center gap-1 text-slate-400">
           <div className="w-2 h-2 rounded-full bg-slate-500" /> OTHER POINTS
        </div>
      </div>

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 0, 4]} />
        <OrbitControls 
          enablePan={false} 
          minDistance={2} 
          maxDistance={6} 
          autoRotate={autoRotate}
          autoRotateSpeed={2}
        />
        
        <AmbientLight intensity={0.5} />
        <PointLight position={[10, 10, 10]} intensity={1} />
        <SpotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />

        <Group position={[0, -0.5, 0]}>
          <StylizedHuman />
          {protocol.points.map(pt => (
            <Point 
              key={pt.id} 
              point={pt} 
              isApplied={appliedPoints.includes(pt.id)}
              isRecommended={protocol.points.some(p => p.id === pt.id)}
              onClick={togglePoint}
            />
          ))}
          
          {/* Ground Reflection */}
          <Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
            <PlaneGeometry args={[10, 10]} />
            <MeshStandardMaterial color="#0f172a" opacity={0.2} transparent />
          </Mesh>
        </Group>
        
        <GridHelper args={[20, 20, '#1e293b', '#0f172a']} position={[0, -1.2, 0]} />
      </Canvas>
    </div>
  );
};

export default HumanModel;
