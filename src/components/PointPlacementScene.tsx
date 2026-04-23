
import React, { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera, Html } from '@react-three/drei';
import { HumanModel, CorpoModel } from './shared/ModelComponents';
import { DEMO_HUMAN_MODEL_URL, CORPO_MODEL_URL, CORPO_TEXTURE_URL } from '../constants';
import { T } from './T';
import styles from './PointsAdmin.module.css';
import { getTransformedPosition } from '../utils/pointMapping';

interface PointPlacementSceneProps {
  selectedModel: 'xbot' | 'corpo';
  position: { x: number; y: number; z: number; isManual?: boolean } | null;
  onPositionChange: (pos: { x: number; y: number; z: number; isManual?: boolean }) => void;
  isLocked: boolean;
}

const ActiveMarker = ({ position, selectedModel, parentScale = 1 }: { 
  position: { x: number; y: number; z: number; isManual?: boolean } | null;
  selectedModel: 'xbot' | 'corpo';
  parentScale?: number;
}) => {
  if (!position) return null;

  // Use the same consistent transformation logic
  const transformedPosition = getTransformedPosition({ 
    code: 'NEW', 
    positions: { [selectedModel]: position } 
  }, selectedModel);
  
  return (
    <mesh position={[transformedPosition.x * parentScale, transformedPosition.y * parentScale, transformedPosition.z * parentScale]}>
      <sphereGeometry args={[0.015, 16, 16]} />
      <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
      <Html distanceFactor={2}>
        <div style={{
          padding: '2px 6px',
          background: '#ef4444',
          color: 'white',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 'bold',
          transform: 'translateY(-20px)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          NEW POSITION
        </div>
      </Html>
    </mesh>
  );
};

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
  selectedModel, 
  position, 
  onPositionChange,
  isLocked
}) => {
  // We'll wrap the models to capture the scale provided by useLayoutEffect
  const SceneContent = () => {
    const [derivedScale, setDerivedScale] = useState(1);

    const onModelClick = (e: any) => {
      if (isLocked) return;
      e.stopPropagation();
      
      const point = e.point; // World point
      
      // Calculate normalized coordinates by reversing the derived scale
      const rawX = point.x / derivedScale;
      let rawY = point.y / derivedScale;
      const rawZ = point.z / derivedScale;
      
      // If we are clicking on the corpo model, we need to reverse the legacy 95-unit Y offset
      // so that it matches how getTransformedPosition re-applies it.
      if (selectedModel === 'corpo') {
        rawY -= 95;
      }
      
      // We set isManual: true so that xbot points stay exactly where we clicked them
      // (bypassing the automatic arm alignment heuristics).
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
        {selectedModel === 'xbot' ? (
          <HumanModel url={DEMO_HUMAN_MODEL_URL} onClick={onModelClick}>
            <ScaleCapturer />
            <ActiveMarker position={position} selectedModel={selectedModel} />
          </HumanModel>
        ) : (
          <CorpoModel url={CORPO_MODEL_URL} textureUrl={CORPO_TEXTURE_URL} onClick={onModelClick}>
            <ScaleCapturer />
            <ActiveMarker position={position} selectedModel={selectedModel} />
          </CorpoModel>
        )}
      </Suspense>
    );
  };

  return (
    <div className={styles.viewportContainer}>
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 1.2, 3]} fov={40} />
        <OrbitControls 
          enablePan={!isLocked} 
          enableRotate={!isLocked} 
          enableZoom={!isLocked}
          target={[0, 1, 0]}
        />
        
        <ambientLight intensity={1.5} />
        <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
        <directionalLight position={[-10, 5, 5]} intensity={0.8} />
        
        <SceneContent />
        
        <Environment preset="city" />
        <ContactShadows opacity={0.3} scale={15} blur={3} far={10} color="#000000" />
        <gridHelper args={[20, 50, 0xe2e8f0, 0xf1f5f9]} position={[0, -0.01, 0]} />
      </Canvas>
    </div>
  );
};

export default PointPlacementScene;
