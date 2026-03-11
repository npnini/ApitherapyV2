
import React from 'react';
import { Html, Line } from '@react-three/drei';
import { StingPoint } from '../types/apipuncture';

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
  const getTransformedPosition = () => {
    const raw = point.positions?.[selectedModel] || { x: 0, y: 0, z: 0 };

    if (selectedModel === 'corpo') {
      return {
        x: raw.x,
        y: raw.y + 95,
        z: raw.z
      };
    }

    if (selectedModel === 'xbot') {
      let { x, y, z } = raw;

      const armPrefixes = ['LI', 'LU', 'SI', 'HT', 'PC', 'TE'];
      const isArmPoint = armPrefixes.some(pref => point.code.startsWith(pref));

      if (isArmPoint && y < 1.4 && Math.abs(x) > 0.1) {
        const sign = Math.sign(x) || 1;
        const shoulderX = 0.18 * sign;
        const shoulderY = 1.45;

        const dx = x - shoulderX;
        const dy = y - shoulderY;

        const armLength = Math.sqrt(dx * dx + dy * dy);

        x = shoulderX + (armLength * sign);
        y = shoulderY - (armLength * 0.05);
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

  // Dynamic label position logic
  // We want the label to be at a fixed X gutter (e.g. ±0.8) but at the same Y as the point
  const gutterX = position.x >= 0 ? 0.8 : -0.8;
  const labelOffsetX = gutterX - position.x;

  // Highlight colors
  const highlightColor = "#ef4444"; // Stronger Red
  const defaultColor = "#2563eb";

  return (
    <group position={[position.x, position.y, position.z]} renderOrder={999}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick(point);
        }}
        renderOrder={1000}
      >
        <sphereGeometry args={[isHighlighted ? 0.04 : 0.02, 16, 16]} />
        <meshStandardMaterial
          color={isHighlighted ? highlightColor : defaultColor}
          emissive={isHighlighted ? highlightColor : defaultColor}
          emissiveIntensity={isHighlighted ? 2.5 : 0.8}
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
          color={isHighlighted ? highlightColor : "#94a3b8"}
          transparent
          opacity={isHighlighted ? 0.8 : 0.3}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {isHighlighted && (
        <>
          {/* Connection Line from point to label gutter */}
          <Line
            points={[[0, 0, 0], [labelOffsetX, 0, 0]]}
            color={highlightColor}
            lineWidth={1}
            transparent
            opacity={0.5}
            depthTest={false}
          />

          {/* Outer label at the gutter */}
          <Html
            distanceFactor={5}
            position={[labelOffsetX, 0, 0]}
            center
            className="pointer-events-none"
          >
            <div
              style={{
                transform: `translateX(${position.x >= 0 ? '50%' : '-50%'})`,
              }}
              className="bg-white/95 text-slate-900 px-3 py-1.5 rounded-lg border-2 border-red-500 text-[11px] font-black whitespace-nowrap shadow-2xl backdrop-blur-sm animate-in fade-in zoom-in duration-200"
            >
              {point.code}
            </div>
          </Html>
        </>
      )}
    </group>
  );
};

export default StingPointMarker;
