import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '../utils/logger';
import { CORPO_MODEL_URL } from '../constants';
import { CorpoModel, ExposureController } from './shared/ModelComponents';
import { useBodyModelLightingConfig, DEFAULT_BODY_MODEL_LIGHTING, BodyModelLightingConfig } from '../hooks/useBodyModelLightingConfig';
import { logAction } from '../services/auditLogService';
import { T } from './T';
import styles from './BodyModelTuner.module.css';

class SceneErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className={styles.crashBox}>
          <div className={styles.crashCard}>
            <p className={styles.crashTitle}><T>The 3D scene crashed</T></p>
            <code className={styles.crashMessage}>{this.state.error.message}</code>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface SliderFieldProps {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: React.ReactNode;
}

const SliderField: React.FC<SliderFieldProps> = ({ label, value, min, max, step, onChange, hint }) => (
  <div className={styles.field}>
    <div className={styles.fieldHeader}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={styles.rangeInput}
    />
    {hint && <span className={styles.fieldHint}>{hint}</span>}
  </div>
);

const BodyModelTuner: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  const { config: savedConfig, loading } = useBodyModelLightingConfig();
  const [baseline, setBaseline] = useState<BodyModelLightingConfig>(DEFAULT_BODY_MODEL_LIGHTING);
  const [draft, setDraft] = useState<BodyModelLightingConfig>(DEFAULT_BODY_MODEL_LIGHTING);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true;
      setBaseline(savedConfig);
      setDraft(savedConfig);
    }
  }, [loading, savedConfig]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const setField = useCallback(<K extends keyof BodyModelLightingConfig>(key: K, value: BodyModelLightingConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Lets the admin scroll the camera target up/down (feet → head) at whatever
  // zoom level they're currently at, since OrbitControls' default target is
  // fixed and mouse drag-panning alone isn't obvious when zoomed in close.
  const controlsRef = useRef<any>(null);
  const [targetY, setTargetY] = useState(0.9);

  const setTargetHeight = useCallback((newY: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as THREE.PerspectiveCamera;
    const delta = newY - controls.target.y;
    controls.target.y = newY;
    camera.position.y += delta;
    controls.update();
    setTargetY(newY);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await setDoc(doc(db, 'cfg_app_config', 'bodyModelLighting'), draft);

      if (user) {
        const changedKeys = (Object.keys(draft) as (keyof BodyModelLightingConfig)[])
          .filter((k) => draft[k] !== baseline[k]);
        logAction(user, {
          category: 'config',
          action: 'update',
          entityType: 'bodyModelLighting',
          entityId: 'bodyModelLighting',
          entityName: '3D Body Model Lighting',
          detail: changedKeys.join(', '),
        });
      }

      setBaseline(draft);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      logger.error('Failed to save body model lighting config:', err);
      setError('Failed to save settings. You must be an administrator to perform this action.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}><T>3D Body Model Lighting</T></h1>
      </div>

      {error && <p className={styles.errorBox}><T>{error}</T></p>}

      <div className={styles.layout}>
        <div className={styles.previewPanel}>
          <div className={styles.canvasWrapper}>
            <SceneErrorBoundary>
              <Canvas shadows>
                <PerspectiveCamera makeDefault position={[0, 0.9, 5.2]} fov={38} />
                <ExposureController exposure={draft.exposure} />
                <OrbitControls
                  ref={controlsRef}
                  enablePan
                  minDistance={0.2}
                  maxDistance={7}
                  target={[0, 0.9, 0]}
                  makeDefault
                />

                <ambientLight intensity={draft.ambientIntensity} />
                <directionalLight position={[draft.keyLightX, draft.keyLightY, 4]} intensity={draft.keyLightIntensity} castShadow={draft.keyLightCastShadow} />
                <directionalLight position={[draft.fillLightX, draft.fillLightY, -4]} intensity={draft.fillLightIntensity} />

                <React.Suspense fallback={null}>
                  <CorpoModel url={CORPO_MODEL_URL} materialConfig={{ mode: draft.materialMode, roughness: draft.roughness }} />
                  {draft.environmentEnabled && (
                    <Environment preset="city" environmentIntensity={draft.environmentIntensity} />
                  )}
                  {draft.contactShadowsEnabled && (
                    <ContactShadows position={[0, 0, 0]} opacity={0.3} scale={15} blur={3} far={10} resolution={512} color="#000000" />
                  )}
                </React.Suspense>

                <gridHelper args={[20, 50, 0xe2e8f0, 0xf1f5f9]} position={[0, -0.01, 0]} />
              </Canvas>
            </SceneErrorBoundary>
          </div>
        </div>

        <div className={styles.controlPanel}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}><T>View</T></p>
            <SliderField
              label={<T>Scroll up/down (feet → head)</T>}
              value={targetY}
              min={0}
              max={1.9}
              step={0.01}
              onChange={setTargetHeight}
              hint={<T>Moves the camera target while keeping your current zoom and rotation.</T>}
            />
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}><T>Lighting</T></p>

            <SliderField
              label={<T>Exposure</T>}
              value={draft.exposure}
              min={0.1}
              max={2}
              step={0.05}
              onChange={(v) => setField('exposure', v)}
              hint={<T>Overall rendered brightness, independent of the lights below.</T>}
            />

            <SliderField
              label={<T>Ambient</T>}
              value={draft.ambientIntensity}
              min={0}
              max={3}
              step={0.05}
              onChange={(v) => setField('ambientIntensity', v)}
            />

            <SliderField
              label={<T>Key light intensity</T>}
              value={draft.keyLightIntensity}
              min={0}
              max={3}
              step={0.05}
              onChange={(v) => setField('keyLightIntensity', v)}
            />

            <SliderField
              label={<T>Fill light intensity</T>}
              value={draft.fillLightIntensity}
              min={0}
              max={3}
              step={0.05}
              onChange={(v) => setField('fillLightIntensity', v)}
            />

            <SliderField
              label={<T>Fill light side offset</T>}
              value={draft.fillLightX}
              min={-12}
              max={12}
              step={0.5}
              onChange={(v) => setField('fillLightX', v)}
            />

            <SliderField
              label={<T>Fill light height</T>}
              value={draft.fillLightY}
              min={0.3}
              max={12}
              step={0.1}
              onChange={(v) => setField('fillLightY', v)}
              hint={<T>This light sits behind the body — it lights the back view.</T>}
            />

            <SliderField
              label={<T>Roughness</T>}
              value={draft.roughness}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(v) => setField('roughness', v)}
            />

            <div className={styles.toggleRow}>
              <span className={styles.fieldLabel}><T>Body self-shadows (key light)</T></span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={draft.keyLightCastShadow}
                  onChange={(e) => setField('keyLightCastShadow', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.toggleRow}>
              <span className={styles.fieldLabel}><T>Ground contact shadow</T></span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={draft.contactShadowsEnabled}
                  onChange={(e) => setField('contactShadowsEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.toggleRow}>
              <span className={styles.fieldLabel}><T>Environment (city HDRI)</T></span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={draft.environmentEnabled}
                  onChange={(e) => setField('environmentEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            {draft.environmentEnabled && (
              <SliderField
                label={<T>Environment intensity</T>}
                value={draft.environmentIntensity}
                min={0}
                max={2}
                step={0.05}
                onChange={(v) => setField('environmentIntensity', v)}
              />
            )}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.button} ${styles.secondaryButton}`}
              onClick={() => setDraft(DEFAULT_BODY_MODEL_LIGHTING)}
              disabled={isSaving}
            >
              <T>Back to initial settings</T>
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.secondaryButton}`}
              onClick={() => setDraft(baseline)}
              disabled={isSaving}
            >
              <T>Back to previous settings</T>
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primaryButton}`}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? <T>Saving...</T> : <T>Save new settings</T>}
            </button>
            {saveSuccess && (
              <div className={styles.statusRow}>
                <span className={styles.successMessage}><T>Settings saved!</T></span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BodyModelTuner;
