
import React, { Suspense, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { useLoader } from '@react-three/fiber';
import { Protocol } from '../types/protocol';
import { StingPoint } from '../types/apipuncture';
import { DEMO_HUMAN_MODEL_URL, CORPO_MODEL_URL, CORPO_TEXTURE_URL } from '../constants';
import { T } from './T';
import StingPointMarker from './StingPointMarker';
import { HumanModel, CorpoModel } from './shared/ModelComponents';
import { getTransformedPosition } from '../utils/pointMapping';

interface BodySceneProps {
  protocol: Protocol | null;
  onPointSelect: (point: StingPoint) => void;
  activePointId: string | null;
  isRolling: boolean;
  selectedModel: 'xbot' | 'corpo';
  resetTrigger?: number;
  sensitivityColorMap?: Record<string, string>; // Map of sensitivity level to color
  onModelTap?: (normalizedPos: { x: number; y: number; z: number }) => void;
  tapPosition?: { x: number; y: number; z: number } | null;
}


/**
 * Renders an orange sphere at the position the practitioner tapped.
 * `position` is in normalized/stored coordinate space (positions.corpo format).
 * getTransformedPosition converts it back to Three.js world coords.
 */
const HitMarker: React.FC<{ position: { x: number; y: number; z: number }; parentScale?: number }> = ({ position, parentScale = 1 }) => {
  const world = getTransformedPosition(
    { code: 'TAP', positions: { corpo: position } } as any,
    'corpo'
  );
  return (
    <mesh position={[world.x * parentScale, world.y * parentScale, world.z * parentScale]}>
      <sphereGeometry args={[0.018, 16, 16]} />
      <meshStandardMaterial
        color="#f97316"
        emissive="#f97316"
        emissiveIntensity={1.2}
        transparent
        opacity={0.9}
        depthTest={false}
      />
    </mesh>
  );
};

const LoadingOverlay = () => (
  <Html center>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', whiteSpace: 'nowrap' }}>
      <div style={{
        width: '3rem',
        height: '3rem',
        border: '4px solid #2563eb',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <div style={{
        background: 'rgba(255,255,255,0.97)',
        padding: '0.75rem 1.5rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      }}>
        <p style={{ color: '#6b7280', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, textAlign: 'center' }}>
          <T>Loading Anatomy</T>
        </p>
      </div>
    </div>
  </Html>
);

const BodyScene: React.FC<BodySceneProps> = ({ protocol, onPointSelect, activePointId, isRolling, selectedModel, resetTrigger, sensitivityColorMap, onModelTap, tapPosition }) => {
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const [targetZoom, setTargetZoom] = React.useState<{ position: THREE.Vector3, target: THREE.Vector3 } | null>(null);

  const [hoveredPointId, setHoveredPointId] = React.useState<string | null>(null);

  const [derivedScale, setDerivedScale] = React.useState(1);

  const ScaleCapturer = ({ parentScale = 1 }: { parentScale?: number }) => {
    React.useEffect(() => { setDerivedScale(parentScale); }, [parentScale]);
    return null;
  };

  const handleModelBodyClick = React.useCallback((e: any) => {
    if (!onModelTap) return;
    // StingPointMarker spheres call e.stopPropagation() so this fires only
    // when the model skin is directly tapped.
    // The CorpoModel geometry has scale and translation applied internally to center it.
    // e.eventObject is the group inside CorpoModel where markers are placed.
    const localPoint = e.eventObject.worldToLocal(e.point.clone());
    
    const rawX = localPoint.x / derivedScale;
    let   rawY = localPoint.y / derivedScale;
    const rawZ = localPoint.z / derivedScale;
    rawY -= 95; // reverse corpo legacy Y offset (see pointMapping.ts)

    onModelTap({ x: rawX, y: rawY, z: rawZ });
  }, [onModelTap, derivedScale]);

  React.useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      setTargetZoom({
        position: new THREE.Vector3(0, 1.2, 4),
        target: new THREE.Vector3(0, 1, 0)
      });
    }
  }, [resetTrigger]);

  const handleDoubleClick = (point: StingPoint, pos: { x: number, y: number, z: number }) => {
    // If the group is rotating, the absolute position is slightly skewed by the group rotation, 
    // but the `pos` given by marker is within the group's local coords.
    // To make it simple, we use the raw transformed point coordinate 
    // and just place the camera close relative to it.

    // Convert local position to world space position relative to the group
    let worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    if (groupRef.current) {
      worldPos = groupRef.current.localToWorld(worldPos.clone());
    }

    const target = worldPos;
    const cameraPos = new THREE.Vector3(worldPos.x, worldPos.y + 0.1, worldPos.z + 0.6);
    setTargetZoom({ position: cameraPos, target: target });
  };

  useFrame((state, delta) => {
    if (isRolling && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }

    if (targetZoom && controlsRef.current) {
      state.camera.position.lerp(targetZoom.position, 0.1);
      controlsRef.current.target.lerp(targetZoom.target, 0.1);
      controlsRef.current.update();

      if (state.camera.position.distanceTo(targetZoom.position) < 0.05) {
        setTargetZoom(null);
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.2, 4]} fov={40} />
      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        minDistance={0.2}
        maxDistance={6}
        target={[0, 1, 0]}
        makeDefault
      />

      <ambientLight intensity={1.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
      <directionalLight position={[-10, 5, 5]} intensity={0.8} />

      <Suspense fallback={<LoadingOverlay />}>
        <group ref={groupRef}>
          {selectedModel === 'xbot' ? (
            <HumanModel url={DEMO_HUMAN_MODEL_URL} onClick={onModelTap ? handleModelBodyClick : undefined}>
              <ScaleCapturer />
              {protocol?.points.map((point: StingPoint) => (
                <StingPointMarker
                  key={point.id}
                  point={point}
                  onClick={onPointSelect}
                  onDoubleClick={handleDoubleClick}
                  isHighlighted={activePointId === point.id}
                  isHovered={hoveredPointId === point.id}
                  onPointerOver={() => setHoveredPointId(point.id)}
                  onPointerOut={() => setHoveredPointId(null)}
                  selectedModel={selectedModel}
                  sensitivityColor={sensitivityColorMap?.[point.sensitivity || '']}
                />
              ))}
            </HumanModel>
          ) : (
            <CorpoModel url={CORPO_MODEL_URL} textureUrl={CORPO_TEXTURE_URL} onClick={onModelTap ? handleModelBodyClick : undefined}>
              <ScaleCapturer />
              {protocol?.points.map((point: StingPoint) => (
                <StingPointMarker
                  key={point.id}
                  point={point}
                  onClick={onPointSelect}
                  onDoubleClick={handleDoubleClick}
                  isHighlighted={activePointId === point.id}
                  isHovered={hoveredPointId === point.id}
                  onPointerOver={() => setHoveredPointId(point.id)}
                  onPointerOut={() => setHoveredPointId(null)}
                  selectedModel={selectedModel}
                  sensitivityColor={sensitivityColorMap?.[point.sensitivity || '']}
                />
              ))}
              {tapPosition && <HitMarker position={tapPosition} />}
            </CorpoModel>
          )}
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
