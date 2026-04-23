
import React, { useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { useLoader } from '@react-three/fiber';

interface ModelProps {
  url: string;
  children?: React.ReactNode;
  onPointerDown?: (e: any) => void;
  onClick?: (e: any) => void;
}

export const HumanModel: React.FC<ModelProps> = ({ url, children, onPointerDown, onClick }) => {
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
    <group 
      ref={groupRef} 
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
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

interface CorpoModelProps extends ModelProps {
  textureUrl: string;
}

export const CorpoModel: React.FC<CorpoModelProps> = ({ url, textureUrl, children, onPointerDown, onClick }) => {
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
    <group 
      ref={groupRef}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
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
