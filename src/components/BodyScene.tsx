
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

interface BodySceneProps {
  protocol: Protocol | null;
  onPointSelect: (point: StingPoint) => void;
  activePointId: string | null;
  isRolling: boolean;
  selectedModel: 'xbot' | 'corpo';
}

const HumanModel = ({ url, children }: { url: string; children?: React.ReactNode }) => {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);
  const [modelScale, setModelScale] = React.useState(1);

  React.useLayoutEffect(() => {
    if (!groupRef.current) return;

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          mesh.material = new THREE.MeshStandardMaterial({
            color: '#e2e8f0',
            roughness: 0.6,
            metalness: 0.1,
            flatShading: false
          });
        }
      }
    });

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const targetHeight = 1.8;
    const scale = targetHeight / size.y;
    setModelScale(scale);

    groupRef.current.position.x = -center.x * scale;
    groupRef.current.position.y = -box.min.y * scale;
    groupRef.current.position.z = -center.z * scale;
  }, [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={modelScale} />
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { parentScale: modelScale });
        }
        return child;
      })}
    </group>
  );
};

const CorpoModel = ({ url, textureUrl, children }: { url: string; textureUrl: string; children?: React.ReactNode }) => {
  const obj = useLoader(OBJLoader, url);
  const texture = useLoader(THREE.TextureLoader, textureUrl);
  const groupRef = useRef<THREE.Group>(null);
  const [modelScale, setModelScale] = React.useState(1);

  React.useLayoutEffect(() => {
    if (!groupRef.current) return;

    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = new THREE.MeshStandardMaterial({
          map: texture,
          color: '#ffffff',
          roughness: 0.7,
          metalness: 0.0,
          flatShading: false
        });
      }
    });

    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const targetHeight = 1.8;
    const scale = targetHeight / size.y;
    setModelScale(scale);

    groupRef.current.position.x = -center.x * scale;
    groupRef.current.position.y = -box.min.y * scale;
    groupRef.current.position.z = -center.z * scale;
  }, [obj, texture]);

  return (
    <group ref={groupRef}>
      <primitive object={obj} scale={modelScale} />
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { parentScale: modelScale });
        }
        return child;
      })}
    </group>
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

const BodyScene: React.FC<BodySceneProps> = ({ protocol, onPointSelect, activePointId, isRolling, selectedModel }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (isRolling && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.2, 4]} fov={40} />
      <OrbitControls
        enablePan={false}
        minDistance={1.2}
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
            <HumanModel url={DEMO_HUMAN_MODEL_URL}>
              {protocol?.points.map((point: StingPoint) => (
                <StingPointMarker
                  key={point.id}
                  point={point}
                  onClick={onPointSelect}
                  isHighlighted={activePointId === point.id}
                  selectedModel={selectedModel}
                />
              ))}
            </HumanModel>
          ) : (
            <CorpoModel url={CORPO_MODEL_URL} textureUrl={CORPO_TEXTURE_URL}>
              {protocol?.points.map((point: StingPoint) => (
                <StingPointMarker
                  key={point.id}
                  point={point}
                  onClick={onPointSelect}
                  isHighlighted={activePointId === point.id}
                  selectedModel={selectedModel}
                />
              ))}
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
