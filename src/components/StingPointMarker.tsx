
import React from 'react';
import { Html } from '@react-three/drei';
import { StingPoint } from '../types/apipuncture';
import { T } from './T';

interface StingPointMarkerProps {
  point: StingPoint;
  onClick: (point: StingPoint) => void;
  isHighlighted: boolean;
  selectedModel: 'xbot' | 'corpo';
  parentScale?: number;
}

const StingPointMarker: React.FC<StingPointMarkerProps> = ({
  point,
  onClick,
  isHighlighted,
  selectedModel,
  parentScale = 1
}) => {
  // Transform coordinates for the Corpo model specifically
  // Transform coordinates dynamically based on the model's actual pose
  const getTransformedPosition = () => {
    const raw = point.positions?.[selectedModel] || { x: 0, y: 0, z: 0 };

    if (selectedModel === 'corpo') {
      // Corpo mesh is A-pose (arms down), and original coordinates are A-pose.
      // We only need the scene origin shift (+95 on Y) to match the model.
      return {
        x: raw.x,
        y: raw.y + 95,
        z: raw.z
      };
    }

    if (selectedModel === 'xbot') {
      let { x, y, z } = raw;

      // Xbot mesh is T-pose (arms out), but its DB coordinates were linearly mapped 
      // from the A-pose Corpo points. We must swing the arm points up to match the mesh.
      const armPrefixes = ['LI', 'LU', 'SI', 'HT', 'PC', 'TE'];
      const isArmPoint = armPrefixes.some(pref => point.code.startsWith(pref));

      // Xbot is scaled to ~1.8 max height. Shoulders are around y=1.45, x=±0.18.
      if (isArmPoint && y < 1.4 && Math.abs(x) > 0.1) {
        const sign = Math.sign(x) || 1;
        const shoulderX = 0.18 * sign;
        const shoulderY = 1.45;

        const dx = x - shoulderX;
        const dy = y - shoulderY;

        // Calculate actual arm point distance from shoulder
        const armLength = Math.sqrt(dx * dx + dy * dy);

        // Swing the arm outwards horizontally (T-pose)
        x = shoulderX + (armLength * sign);

        // Add tiny natural droop proportional to arm length
        y = shoulderY - (armLength * 0.05);

        // Slightly push arms forward on Z axis (to rest on the mesh surface)
        z += (armLength * 0.1);
      }
      return { x, y, z };
    }

    return raw;
  };

  const transformedPosition = getTransformedPosition();
  const position = {
    x: transformedPosition.x * parentScale,
    y: transformedPosition.y * parentScale,
    z: transformedPosition.z * parentScale
  };

  // Safety check for display
  if (!point.positions?.[selectedModel] && selectedModel !== 'xbot') return null;

  return (
    <group position={[position.x, position.y, position.z]} renderOrder={999}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick(point);
        }}
        renderOrder={1000}
      >
        <sphereGeometry args={[isHighlighted ? 0.035 : 0.02, 16, 16]} />
        <meshStandardMaterial
          color={isHighlighted ? "#ffb617" : "#2563eb"}
          emissive={isHighlighted ? "#ffb617" : "#2563eb"}
          emissiveIntensity={isHighlighted ? 1.5 : 0.8}
          transparent={!isHighlighted}
          opacity={isHighlighted ? 1 : 0.6}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Visual ring - pulse effect when highlighted */}
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1001}>
        <ringGeometry args={[0.035, 0.045, 32]} />
        <meshBasicMaterial
          color={isHighlighted ? "#ffb617" : "#94a3b8"}
          transparent
          opacity={isHighlighted ? 0.8 : 0.3}
          depthTest={false}
          depthWrite={false}
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
