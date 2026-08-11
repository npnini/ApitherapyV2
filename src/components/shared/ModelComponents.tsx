
import React, { useRef, useLayoutEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { useLoader, useThree } from '@react-three/fiber';

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

export interface CorpoMaterialConfig {
  mode: 'flat' | 'triplanar';
  roughness: number;
}

interface CorpoModelProps extends ModelProps {
  materialConfig: CorpoMaterialConfig;
  onModelLoad?: (obj: THREE.Object3D) => void;
}

const FLAT_SKIN_COLOR = '#e3b28f';

// Triplanar: procedural skin-like shading projected from world position/normal,
// independent of corpo.obj's (unreliable — effectively absent) UV unwrap. Uses
// onBeforeCompile to inject a small value-noise blend into the standard PBR
// pipeline so it still responds correctly to the scene's real lights.
function buildMaterial(mode: 'flat' | 'triplanar', roughness: number): THREE.Material {
  if (mode === 'flat') {
    return new THREE.MeshStandardMaterial({
      color: FLAT_SKIN_COLOR,
      roughness,
      metalness: 0.0,
    });
  }

  const material = new THREE.MeshStandardMaterial({
    color: FLAT_SKIN_COLOR,
    roughness,
    metalness: 0.0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoiseScale = { value: 6.0 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        uniform float uNoiseScale;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 blendWeights = abs(normalize(vNormal));
          blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z + 1e-5);
          float nX = valueNoise(vWorldPos.yz * uNoiseScale);
          float nY = valueNoise(vWorldPos.xz * uNoiseScale);
          float nZ = valueNoise(vWorldPos.xy * uNoiseScale);
          float n = nX * blendWeights.x + nY * blendWeights.y + nZ * blendWeights.z;
          diffuseColor.rgb *= mix(0.88, 1.12, n);
        }`
      );
  };

  return material;
}

export const CorpoModel: React.FC<CorpoModelProps> = ({ url, materialConfig, onModelLoad, children, onPointerDown, onClick }) => {
  const obj = useLoader(OBJLoader, url);
  const groupRef = useRef<THREE.Group>(null);
  const [modelScale, setModelScale] = React.useState(1);

  React.useEffect(() => {
    onModelLoad?.(obj);
  }, [obj]);

  // Work around a malformed corpo.obj: a single stray `l` (line) command at
  // the very end of the file flips OBJLoader's classification of the entire
  // ~180k-vertex body object to "Line", so it gets built as a LineSegments
  // (drawing every triangle edge as a wireframe line) instead of a Mesh —
  // even though the underlying position/normal buffer is valid triangulated
  // face data. Rebuild it as a real Mesh from the same geometry. Depends only
  // on obj (not materialConfig) so it runs once per loaded model.
  React.useLayoutEffect(() => {
    const misclassified: THREE.LineSegments[] = [];
    obj.traverse((child: any) => {
      if (child.isLineSegments) misclassified.push(child);
    });
    misclassified.forEach((line) => {
      const mesh = new THREE.Mesh(line.geometry, line.material);
      mesh.name = line.name;
      line.parent?.add(mesh);
      line.parent?.remove(line);
    });
  }, [obj]);

  // Center/scale the model. Deliberately independent of materialConfig: the
  // <primitive scale={modelScale}> below mutates obj.scale directly, so if
  // this effect re-ran after that mutation (e.g. on every material/roughness
  // change) it would measure the already-scaled object and compound the
  // transform, making the model balloon to ~100x size every other change.
  React.useLayoutEffect(() => {
    if (!groupRef.current) return;

    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const targetHeight = 1.8;
    const scale = targetHeight / size.y;
    setModelScale(scale);

    groupRef.current.position.x = -center.x * scale;
    groupRef.current.position.y = -box.min.y * scale;
    groupRef.current.position.z = -center.z * scale;
  }, [obj]);

  // Material assignment is safe to re-run on every materialConfig change —
  // it only swaps each mesh's .material, never touches scale/position.
  React.useLayoutEffect(() => {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = buildMaterial(materialConfig.mode, materialConfig.roughness);
      }
    });
  }, [obj, materialConfig.mode, materialConfig.roughness]);

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

// Sets the renderer's tone-mapping exposure directly — this is the one lever
// guaranteed to visibly move the final image regardless of how the ambient/
// directional/environment lights interact or clip against each other.
export const ExposureController: React.FC<{ exposure: number }> = ({ exposure }) => {
  const { gl } = useThree();
  useLayoutEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
};
