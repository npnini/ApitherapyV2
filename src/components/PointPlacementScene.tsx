
import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CorpoModel, ExposureController } from './shared/ModelComponents';
import { CORPO_MODEL_URL } from '../constants';
import { T } from './T';
import styles from './PointsAdmin.module.css';
import { getTransformedPosition } from '../utils/pointMapping';
import { useBodyModelLightingConfig } from '../hooks/useBodyModelLightingConfig';
import { MARKER_OUTWARD_OFFSET, findSurfaceOffsetDirection, naiveRadialOffsetDirection } from '../utils/markerSurfaceOffset';

interface PointPlacementSceneProps {
  position: { x: number; y: number; z: number; isManual?: boolean } | null;
  onPositionChange: (pos: { x: number; y: number; z: number; isManual?: boolean }) => void;
  isLocked: boolean;
}

const ActiveMarker = ({ position, parentScale = 1, corpoObj }: {
  position: { x: number; y: number; z: number; isManual?: boolean } | null;
  parentScale?: number;
  corpoObj?: THREE.Object3D | null;
}) => {
  // Use the same consistent transformation logic
  const transformedPosition = position ? getTransformedPosition({
    code: 'NEW',
    positions: { corpo: position }
  }) : null;

  const worldX = transformedPosition ? transformedPosition.x * parentScale : 0;
  const worldY = transformedPosition ? transformedPosition.y * parentScale : 0;
  const worldZ = transformedPosition ? transformedPosition.z * parentScale : 0;

  const offsetDir = useMemo(() => {
    if (!transformedPosition) return new THREE.Vector3(0, 0, 1);
    if (corpoObj) {
      return findSurfaceOffsetDirection(worldX, worldY, worldZ, corpoObj);
    }
    return naiveRadialOffsetDirection(worldX, worldZ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldX, worldY, worldZ, corpoObj]);

  if (!position || !transformedPosition) return null;

  return (
    <mesh
      position={[
        worldX + offsetDir.x * MARKER_OUTWARD_OFFSET,
        worldY + offsetDir.y * MARKER_OUTWARD_OFFSET,
        worldZ + offsetDir.z * MARKER_OUTWARD_OFFSET,
      ]}
    >
      <sphereGeometry args={[0.015, 16, 16]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#ef4444"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
};

// A fixed, screen-space instruction banner instead of a 3D-anchored "NEW POSITION"
// label: the 3D-anchored label had to be re-projected to screen space every frame,
// which made it drift off from the marker, oversize itself, and sometimes render
// far from the actual point depending on camera angle/distance. Static text has
// none of those failure modes.
const PlacementHint = () => (
  <div style={{
    position: 'absolute',
    top: '0.75rem',
    left: '0.75rem',
    padding: '0.4rem 0.85rem',
    background: '#dbeafe',
    color: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #bfdbfe',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    fontSize: '0.8rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 5,
  }}>
    <T>Click on model to indicate new position</T>
  </div>
);

const LoadingOverlay = () => (
  <Html center>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <div className={styles.spinner} />
      <div style={{ background: 'white', padding: '0.5rem 1rem', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <T>Loading Model...</T>
      </div>
    </div>
  </Html>
);

const PointPlacementScene: React.FC<PointPlacementSceneProps> = ({
  position,
  onPositionChange,
  isLocked
}) => {
  const { config } = useBodyModelLightingConfig();
  // We'll wrap the models to capture the scale provided by useLayoutEffect
  const SceneContent = () => {
    const [derivedScale, setDerivedScale] = useState(1);
    const [corpoObj, setCorpoObj] = useState<THREE.Object3D | null>(null);

    const onModelClick = (e: any) => {
      e.stopPropagation();
      
      const point = e.point; // World point
      
      // Calculate normalized coordinates by reversing the derived scale
      const rawX = point.x / derivedScale;
      let rawY = point.y / derivedScale;
      const rawZ = point.z / derivedScale;

      // Reverse the legacy 95-unit Y offset so it matches how getTransformedPosition re-applies it.
      rawY -= 95;

      onPositionChange({ x: rawX, y: rawY, z: rawZ, isManual: true });
    };

    // This component will receive parentScale via React.cloneElement from HumanModel/CorpoModel
    const ScaleCapturer = ({ parentScale = 1 }: { parentScale?: number }) => {
      React.useEffect(() => {
        setDerivedScale(parentScale);
      }, [parentScale]);
      return null;
    };

    return (
      <Suspense fallback={<LoadingOverlay />}>
        <CorpoModel url={CORPO_MODEL_URL} materialConfig={{ mode: config.materialMode, roughness: config.roughness }} onClick={onModelClick} onModelLoad={setCorpoObj}>
          <ScaleCapturer />
          <ActiveMarker position={position} corpoObj={corpoObj} />
        </CorpoModel>
      </Suspense>
    );
  };

  return (
    <div className={styles.viewportContainer}>
      <PlacementHint />
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 1.2, 3]} fov={40} />
        <ExposureController exposure={config.exposure} />
        <OrbitControls
          enablePan={true}
          enableRotate={true}
          enableZoom={true}
          autoRotate={!isLocked}
          autoRotateSpeed={2.0}
          target={[0, 1, 0]}
        />

        <ambientLight intensity={config.ambientIntensity} />
        <directionalLight position={[config.keyLightX, config.keyLightY, 4]} intensity={config.keyLightIntensity} castShadow />
        <directionalLight position={[config.fillLightX, config.fillLightY, -4]} intensity={config.fillLightIntensity} />

        <SceneContent />

        {config.environmentEnabled && (
          <Environment preset="city" environmentIntensity={config.environmentIntensity} />
        )}
        <ContactShadows opacity={0.3} scale={15} blur={3} far={10} color="#000000" />
        <gridHelper args={[20, 50, 0xe2e8f0, 0xf1f5f9]} position={[0, -0.01, 0]} />
      </Canvas>
    </div>
  );
};

export default PointPlacementScene;
