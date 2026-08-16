
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { PointGroupLaterality } from '../types/pointGroup';

// Canonical camera poses for laterality-locked (front/back) point groups.
// Front matches the scene's normal default pose; back is its 180°-azimuth,
// Z-negated mirror around the same target.
const FRONT_POSE = { position: new THREE.Vector3(0, 1.2, 3), target: new THREE.Vector3(0, 1, 0) };
const BACK_POSE = { position: new THREE.Vector3(0, 1.2, -3), target: new THREE.Vector3(0, 1, 0) };

// OrbitControls' azimuthal angle (theta = atan2(x, z) around the target) for
// each canonical pose — locking min/maxAzimuthAngle to this value pins the
// camera to strictly front-on or strictly back-on, while leaving the polar
// angle (tilting up/down, e.g. to look toward the top of the head) free.
const FRONT_AZIMUTH = 0;
const BACK_AZIMUTH = Math.PI;

interface PointPlacementSceneProps {
  position: { x: number; y: number; z: number; isManual?: boolean } | null;
  onPositionChange: (pos: { x: number; y: number; z: number; isManual?: boolean }) => void;
  isLocked: boolean;
  laterality?: PointGroupLaterality | null;
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
      renderOrder={999}
    >
      <sphereGeometry args={[0.012, 16, 16]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#ef4444"
        emissiveIntensity={0.5}
        // The outward offset (MARKER_OUTWARD_OFFSET) is only ever an
        // approximation of the true local surface normal — close, but not
        // exact. At the marker's original small radius, that approximation
        // error was enough to leave it partially or fully depth-occluded by
        // the surrounding skin surface at normal camera distances, making
        // it effectively invisible. Rendering without depth test/write (and
        // after opaque geometry, via renderOrder) guarantees it's always
        // visible on top, regardless of that small positioning error.
        depthTest={false}
        depthWrite={false}
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

const FrontBackLockHint = ({ laterality }: { laterality: PointGroupLaterality }) => (
  <div style={{
    position: 'absolute',
    top: '0.75rem',
    right: '0.75rem',
    padding: '0.4rem 0.85rem',
    background: '#fef3c7',
    color: '#78350f',
    borderRadius: '0.5rem',
    border: '1px solid #fde68a',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    fontSize: '0.8rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 5,
  }}>
    <T>{laterality === 'Midline-front' ? 'Camera locked to front view' : 'Camera locked to back view'}</T>
  </div>
);

const PointPlacementScene: React.FC<PointPlacementSceneProps> = ({
  position,
  onPositionChange,
  isLocked,
  laterality = null
}) => {
  const { config } = useBodyModelLightingConfig();
  const controlsRef = useRef<any>(null);
  const isFrontBackLocked = laterality === 'Midline-front' || laterality === 'Midline-back';

  // Snap the camera to the canonical front/back pose the moment laterality is
  // known (or changes) — the point can only be marked from that fixed angle.
  const applyLockedPose = (lat: PointGroupLaterality | null | undefined) => {
    const instance = controlsRef.current;
    if (!instance) return;
    const pose = lat === 'Midline-front' ? FRONT_POSE : lat === 'Midline-back' ? BACK_POSE : null;
    if (!pose) return;
    instance.object.position.copy(pose.position);
    instance.target.copy(pose.target);
    instance.update();
  };

  // Callback ref (not a plain useRef + useEffect): the OrbitControls instance
  // is created deep inside react-three-fiber's own async render tree, which
  // can mount after this component's own effects have already run — a plain
  // useEffect on [laterality] can fire while controlsRef.current is still
  // null and never re-fire (laterality doesn't change again on a normal
  // "open an already-grouped point" flow), silently skipping the snap.
  // A callback ref applies the pose the instant the instance actually exists.
  const handleControlsRef = (instance: any) => {
    controlsRef.current = instance;
    if (instance) applyLockedPose(laterality);
  };

  // Still needed for the case where laterality changes *after* mount (the
  // admin picks/changes a midline group while the modal is already open).
  useEffect(() => {
    applyLockedPose(laterality);
  }, [laterality]);

  // We'll wrap the models to capture the scale provided by useLayoutEffect
  const SceneContent = () => {
    const [derivedScale, setDerivedScale] = useState(1);
    const [corpoObj, setCorpoObj] = useState<THREE.Object3D | null>(null);

    const onModelClick = (e: any) => {
      e.stopPropagation();

      // The CorpoModel geometry has scale and translation applied internally to
      // center it. e.eventObject is the group inside CorpoModel where markers
      // are placed, so converting into its local space removes that centering
      // translation before we reverse the scale — matching BodyScene.tsx's
      // handleModelBodyClick, which does the same for its own tap-to-find flow.
      const localPoint = e.eventObject.worldToLocal(e.point.clone());

      const rawX = localPoint.x / derivedScale;
      let rawY = localPoint.y / derivedScale;
      const rawZ = localPoint.z / derivedScale;

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
      {isFrontBackLocked && <FrontBackLockHint laterality={laterality!} />}
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 1.2, 3]} fov={40} />
        <ExposureController exposure={config.exposure} />
        <OrbitControls
          ref={handleControlsRef}
          enablePan={true}
          enableRotate={true}
          enableZoom={true}
          autoRotate={isFrontBackLocked ? false : !isLocked}
          autoRotateSpeed={2.0}
          target={[0, 1, 0]}
          // Lock only the horizontal (azimuthal) orbit to strictly front-on or
          // back-on — that's the constraint that actually defines "front" vs
          // "back". Vertical tilt (polar angle) stays free so the admin can
          // still look up/down (e.g. toward the top of the head) without
          // rotating around to the other side.
          minAzimuthAngle={laterality === 'Midline-front' ? FRONT_AZIMUTH : laterality === 'Midline-back' ? BACK_AZIMUTH : -Infinity}
          maxAzimuthAngle={laterality === 'Midline-front' ? FRONT_AZIMUTH : laterality === 'Midline-back' ? BACK_AZIMUTH : Infinity}
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
