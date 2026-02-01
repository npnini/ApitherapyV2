
import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Capsule, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { StingPoint, Protocol } from '../../types';

// Stylized Human Model Component (built with primitives)
const StylizedHuman: React.FC = () => {
    const material = <meshStandardMaterial color="#cccccc" transparent opacity={0.6} />;
    return (
        <group>
            {/* Torso */}
            <Capsule args={[0.25, 1, 2, 8]} position={[0, 0.5, 0]}>
                {material}
            </Capsule>
            {/* Head */}
            <Sphere args={[0.2, 32, 32]} position={[0, 1.45, 0]}>
                {material}
            </Sphere>
            {/* Left Arm */}
            <Capsule args={[0.08, 0.7, 2, 8]} position={[0.45, 0.6, 0]} rotation={[0, 0, -Math.PI / 9]}>
                {material}
            </Capsule>
            {/* Right Arm */}
            <Capsule args={[0.08, 0.7, 2, 8]} position={[-0.45, 0.6, 0]} rotation={[0, 0, Math.PI / 9]}>
                {material}
            </Capsule>
            {/* Left Leg */}
            <Capsule args={[0.1, 0.9, 2, 8]} position={[0.15, -0.5, 0]}>
                {material}
            </Capsule>
            {/* Right Leg */}
            <Capsule args={[0.1, 0.9, 2, 8]} position={[-0.15, -0.5, 0]}>
                {material}
            </Capsule>
        </group>
    );
};


// Point Component
function Point({ point, isStung, onSelect, onDoubleClick }: { point: StingPoint, isStung: boolean, onSelect: () => void, onDoubleClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const vec = new THREE.Vector3(point.position.x, point.position.y, point.position.z);
  
  return (
    <mesh position={vec}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshBasicMaterial color={isStung ? 'yellow' : isHovered ? 'orange' : 'red'} />
      <Html>
        <div 
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={onSelect}
          onDoubleClick={onDoubleClick}
          style={{ 
            cursor: 'pointer',
            width: '20px',
            height: '20px',
            transform: 'translate(-50%, -50%)'
          }} />
      </Html>
       {isHovered && (
        <Html position={[0, 0.05, 0]}>
          <div className="bg-slate-900 text-white text-xs rounded p-2 shadow-lg">
            <p className="font-bold text-yellow-500">{point.name}</p>
            <p>{point.explanation}</p>
          </div>
        </Html>
      )}
    </mesh>
  );
}

// Main Component
interface Interactive3DModelProps {
  protocol: Protocol | null;
  stungPoints: StingPoint[];
  onPointSelected: (point: StingPoint) => void;
}

// Redefining protocol points with 3D positions to fit the new model
const protocols3D: Protocol[] = [
    { id: 'proto1', name: 'Protocol A: Anti-Inflammatory', points: [
        { id: 'p1', name: 'LI4', explanation: 'Key anti-inflammatory point.', position: { x: 0.55, y: 0.2, z: 0.1 } }, // Hand
        { id: 'p2', name: 'ST36', explanation: 'Boosts overall energy.', position: { x: 0.2, y: -0.6, z: 0.1 } }, // Lower Leg
        { id: 'p3', name: 'GB20', explanation: 'Relieves neck tension.', position: { x: 0.1, y: 1.25, z: 0.1 } }, // Neck/Head
      ]
    },
    { id: 'proto2', name: 'Protocol B: Nerve & Systemic Balance', points: [
          { id: 'p4', name: 'PC6', explanation: 'Calms the nervous system.', position: { x: 0.5, y: 0.1, z: 0.1 } }, // Forearm
          { id: 'p5', name: 'SP6', explanation: 'Balances multiple systems.', position: { x: 0.18, y: -0.9, z: 0.1 } }, // Ankle
      ]
    },
];

const Interactive3DModel: React.FC<Interactive3DModelProps> = ({ protocol, stungPoints, onPointSelected }) => {
  const currentProtocol3D = protocol ? protocols3D.find(p => p.id === protocol.id) : null;

  return (
    <div className="w-full h-full bg-slate-100 rounded-3xl relative">
      <Canvas camera={{ position: [0, 0, 3.5], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} />
        <Suspense fallback={null}>
            <group position={[0, -0.5, 0]}>
                <StylizedHuman />
                {currentProtocol3D && currentProtocol3D.points.map(point => (
                    <Point 
                        key={point.id} 
                        point={point} 
                        isStung={stungPoints.some(sp => sp.id === point.id)}
                        onSelect={() => { /* Single click can show info, handled by hover for now */ }}
                        onDoubleClick={() => onPointSelected(point)}
                    />
                ))}
            </group>
        </Suspense>
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
      </Canvas>
    </div>
  );
};

export default Interactive3DModel;
