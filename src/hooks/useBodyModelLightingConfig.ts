import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface BodyModelLightingConfig {
  ambientIntensity: number;
  keyLightIntensity: number;
  keyLightX: number;
  keyLightY: number;
  fillLightIntensity: number;
  fillLightX: number;
  fillLightY: number;
  environmentEnabled: boolean;
  environmentIntensity: number;
  exposure: number;
  roughness: number;
  materialMode: 'flat' | 'triplanar';
}

export const DEFAULT_BODY_MODEL_LIGHTING: BodyModelLightingConfig = {
  ambientIntensity: 0.35,
  keyLightIntensity: 1.10,
  keyLightX: 4.0,
  keyLightY: 3.7,
  fillLightIntensity: 1.50,
  fillLightX: -11.5,
  fillLightY: 3.3,
  environmentEnabled: true,
  environmentIntensity: 0.25,
  exposure: 0.80,
  roughness: 0.50,
  materialMode: 'flat',
};

/**
 * Fetches cfg_app_config/bodyModelLighting once on mount. Falls back to
 * DEFAULT_BODY_MODEL_LIGHTING while loading or if the doc doesn't exist yet,
 * so production never regresses to the old broken look before an admin saves.
 */
export function useBodyModelLightingConfig() {
  const [config, setConfig] = useState<BodyModelLightingConfig>(DEFAULT_BODY_MODEL_LIGHTING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getDoc(doc(db, 'cfg_app_config', 'bodyModelLighting'))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          setConfig(snap.data() as BodyModelLightingConfig);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('useBodyModelLightingConfig: getDoc failed', err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading };
}
