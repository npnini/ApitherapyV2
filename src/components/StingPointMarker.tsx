import React, { useRef, useState } from 'react';
import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { StingPoint } from '../types/apipuncture';

interface StingPointMarkerProps {
  point: StingPoint;
  onClick: (point: StingPoint) => void;
  onDoubleClick?: (point: StingPoint, position: { x: number, y: number, z: number }) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  isHighlighted: boolean;
  isHovered?: boolean;
  selectedModel: 'xbot' | 'corpo';
  parentScale?: number;
  sensitivityColor?: string; // blue shade based on sensitivity level
}

const StingPointMarker: React.FC<StingPointMarkerProps> = ({
  point,
  onClick,
  onDoubleClick,
  onPointerOver,
  onPointerOut,
  isHighlighted,
  isHovered = false,
  selectedModel,
  parentScale = 1,
  sensitivityColor,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [lineScale, setLineScale] = useState(1);

  useFrame((state) => {
    if (groupRef.current) {
      const worldPos = new THREE.Vector3();
      groupRef.current.getWorldPosition(worldPos);
      const dist = state.camera.position.distanceTo(worldPos);

      // Dynamic line length scaling: 
      // Default distance is ~4. Zoomed in is ~0.5.
      // We want the line to be 100% at dist >= 3, and scale down to ~30% at dist=0.5
      const scale = THREE.MathUtils.clamp(dist / 3, 0.35, 1.2);
      if (Math.abs(lineScale - scale) > 0.01) {
        setLineScale(scale);
      }
    }
  });

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
  // Base gutter is 0.8 world units. LineScale shortens it.
  const baseGutterX = position.x >= 0 ? 0.8 : -0.8;
  const gutterX = baseGutterX * lineScale;
  const labelOffsetX = gutterX - position.x;

  // Highlight colors
  const highlightColor = "#ef4444"; // Stronger Red
  const hoverColor = "#fb923c"; // Orange for hover
  const defaultColor = sensitivityColor ?? "#2563eb"; // Sensitivity-tinted blue, fallback to default blue

  const isVisible = isHighlighted || isHovered;
  const activeColor = isHighlighted ? highlightColor : hoverColor;

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]} renderOrder={999}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick(point);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (onDoubleClick) onDoubleClick(point, position);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onPointerOver?.();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onPointerOut?.();
        }}
        renderOrder={1000}
      >
        <sphereGeometry args={[isVisible ? 0.04 : 0.02, 16, 16]} />
        <meshStandardMaterial
          color={isVisible ? activeColor : defaultColor}
          emissive={isVisible ? activeColor : defaultColor}
          emissiveIntensity={isVisible ? 2.5 : 0.8}
          transparent={!isVisible}
          opacity={isVisible ? 1 : 0.6}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Visual ring - pulse effect when highlighted or hovered */}
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1001}>
        <ringGeometry args={[0.035, 0.045, 32]} />
        <meshBasicMaterial
          color={isVisible ? activeColor : "#94a3b8"}
          transparent
          opacity={isVisible ? 0.8 : 0.3}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {isVisible && (
        <>
          {/* Connection Line from point to label gutter */}
          <Line
            points={[[0, 0, 0], [labelOffsetX, 0, 0]]}
            color={activeColor}
            lineWidth={1}
            transparent
            opacity={0.5}
            depthTest={false}
          />

          {/* Outer label at the gutter */}
          <Html
            position={[labelOffsetX, 0, 0]}
            center
            className="pointer-events-none"
          >
            <div
              style={{
                transform: `translateX(${position.x >= 0 ? '50%' : '-50%'}) scale(${isHighlighted ? 1 : 0.85})`,
                background: 'rgba(255,255,255,0.97)',
                color: '#0f172a',
                padding: '0.25rem 0.5rem',
                borderRadius: '6px',
                border: `2px solid ${activeColor}`,
                fontSize: '10px',
                lineHeight: '1',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'all 0.1s ease',
              }}
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
