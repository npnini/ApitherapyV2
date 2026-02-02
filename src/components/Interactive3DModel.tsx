
import React, { useState, useRef, Suspense, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { APITHERAPY_PROTOCOLS } from '../data/apipunctureData';
import { Protocol, StingPoint } from '../types/apipuncture';
import { HumanModel } from './HumanModel';
import StingPointMarker from './StingPointMarker';
import { Target, Info, RotateCcw } from 'lucide-react';

interface Interactive3DModelProps {
  initialProtocolId?: string;
  onPointClick?: (point: StingPoint) => void;
  showSidebar?: boolean;
}

const Scene = ({ protocol, activePointId, isRolling, onPointSelect }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (isRolling && groupRef.current) groupRef.current.rotation.y += delta * 0.4;
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.2, 3.5]} fov={40} />
      <OrbitControls enablePan={false} minDistance={1.2} maxDistance={5} target={[0, 1, 0]} />
      <ambientLight intensity={1} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <group ref={groupRef}>
        <HumanModel />
        {protocol?.points.map((p: StingPoint) => (
          <StingPointMarker 
            key={p.id} 
            point={p} 
            onClick={onPointSelect} 
            isHighlighted={activePointId === p.id} 
          />
        ))}
      </group>
      <Environment preset="city" />
      <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={10} blur={2} />
    </>
  );
};

const Interactive3DModel: React.FC<Interactive3DModelProps> = ({ 
  initialProtocolId, 
  onPointClick,
  showSidebar = true 
}) => {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(true);

  useEffect(() => {
    if (initialProtocolId) {
      const p = APITHERAPY_PROTOCOLS.find(x => x.id === initialProtocolId);
      if (p) setSelectedProtocol(p);
    }
  }, [initialProtocolId]);

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden rounded-xl border border-slate-200">
      {showSidebar && (
        <div className="w-72 border-r border-slate-200 bg-white p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Target className="w-3 h-3" /> Protocols
          </h3>
          <div className="flex flex-col gap-1.5">
            {APITHERAPY_PROTOCOLS.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProtocol(p)}
                className={`text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                  selectedProtocol?.id === p.id 
                    ? 'bg-red-600 border-red-700 text-white' 
                    : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold">{p.name}</div>
              </button>
            ))}
          </div>

          {selectedProtocol && (
            <div className="mt-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Points</h4>
              <div className="flex flex-col gap-1">
                {selectedProtocol.points.map(pt => (
                  <div
                    key={pt.id}
                    onMouseEnter={() => setHoveredPointId(pt.id)}
                    onMouseLeave={() => setHoveredPointId(null)}
                    className={`flex items-center gap-2 p-2 rounded border text-[11px] transition-colors ${
                      hoveredPointId === pt.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-500'
                    }`}
                  >
                    <span className="font-black text-red-500">{pt.code}</span>
                    <span className="truncate">{pt.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 relative bg-white">
        <div className="absolute top-4 right-4 z-10">
          <button 
            onClick={() => setIsRolling(!isRolling)}
            className={`p-2 rounded-full shadow border transition-colors ${isRolling ? 'bg-red-50 text-red-500' : 'bg-white text-slate-400'}`}
          >
            <RotateCcw className={`w-5 h-5 ${isRolling ? 'animate-spin-slow' : ''}`} />
          </button>
        </div>
        
        <Canvas shadows>
          <Suspense fallback={null}>
            <Scene 
              protocol={selectedProtocol} 
              activePointId={hoveredPointId} 
              isRolling={isRolling}
              onPointSelect={(p: StingPoint) => {
                if (onPointClick) onPointClick(p);
                setHoveredPointId(p.id);
              }}
            />
          </Suspense>
        </Canvas>

        {!selectedProtocol && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/80 backdrop-blur p-6 rounded-2xl border border-slate-100 shadow-xl text-center max-w-xs">
              <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm font-medium">Select a protocol to begin</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Interactive3DModel;
