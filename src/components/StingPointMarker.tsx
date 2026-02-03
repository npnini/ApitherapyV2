
import React from 'react';
import { Html } from '@react-three/drei';
import { StingPoint } from '../types';

interface StingPointMarkerProps {
  point: StingPoint;
  onClick: (point: StingPoint) => void;
  isHighlighted: boolean;
}

const StingPointMarker: React.FC<StingPointMarkerProps> = ({ point, onClick, isHighlighted }) => {
  return (
    <group position={[point.position.x, point.position.y, point.position.z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick(point);
        }}
      >
        <sphereGeometry args={[isHighlighted ? 0.035 : 0.02, 16, 16]} />
        <meshStandardMaterial 
          color={isHighlighted ? "#ff0000" : "#2563eb"} 
          emissive={isHighlighted ? "#ff0000" : "#2563eb"}
          emissiveIntensity={isHighlighted ? 2 : 0.8}
          transparent={!isHighlighted}
          opacity={isHighlighted ? 1 : 0.6}
        />
      </mesh>
      
      {/* Visual ring - pulse effect when highlighted */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.035, 0.045, 32]} />
        <meshBasicMaterial 
          color={isHighlighted ? "#ff0000" : "#94a3b8"} 
          transparent 
          opacity={isHighlighted ? 0.8 : 0.3} 
        />
      </mesh>

      {isHighlighted && (
        <Html distanceFactor={5} position={[0.06, 0.06, 0]}>
          <div className="bg-white/95 text-slate-900 px-3 py-1.5 rounded-lg border-2 border-red-500 text-[10px] font-black whitespace-nowrap shadow-2xl backdrop-blur-sm animate-bounce">
            {point.code}
          </div>
        </Html>
      )}
    </group>
  );
};

export default StingPointMarker;
