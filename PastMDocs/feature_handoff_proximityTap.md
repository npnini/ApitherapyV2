# Feature Handoff: Proximity Tap — Location-Based Point Discovery

### Feature for: `TreatmentExecution` — Free Selection mode
### Project root: `C:\Users\User\Dev\Projects\ApitherapyV2`

---

## 1. Feature Overview

When a practitioner opens **Free Selection** (no pre-selected protocol), instead of working
from an empty list they can:

1. Navigate the Corpo 3D model to the patient's area of pain.
2. **Tap** the model surface.
3. Receive a ranked short-list of the N nearest acupuncture points **within a configured CUN radius**.
4. View each point's docs/images, and click to mark it "stung".
5. Repeat (tap a new area) or press Next Step once done.

**UX State Machine:**
```
IDLE ──[tap model]──► LOADING ──► RESULTS  (or EMPTY-RADIUS if 0 found)
 ▲                                    │
 └──────[Clear & Restart]─────────────┘
                         (stung list never cleared)
```

---

## 2. Architecture Context (Read Before Coding)

### 2.1 Relevant Files

| File | Role |
|---|---|
| `src/components/TreatmentExecution.tsx` | Main orchestrator. Owns all state. **Primary target.** |
| `src/components/TreatmentExecution.module.css` | CSS for the above. |
| `src/components/BodyScene.tsx` | R3F scene inside the Canvas. Renders model + StingPointMarker spheres. **Must be extended.** |
| `src/components/shared/ModelComponents.tsx` | `HumanModel` and `CorpoModel` R3F groups. Already accept an `onClick` prop — forward it to the group element. |
| `src/components/PointPlacementScene.tsx` | **Reference only.** Contains the proven click normalization logic. Do NOT modify. |
| `src/utils/pointMapping.ts` | `getTransformedPosition()` — converts stored coords → Three.js world coords. |
| `src/config/appConfigSchema.ts` | Schema that drives the ApplicationSettings UI automatically. Add 3 fields here. |
| `src/types/apipuncture.ts` | Type definitions — `StingPoint`, `Vector3Pos`. |
| `src/constants.ts` | `CORPO_MODEL_URL`, `CORPO_TEXTURE_URL` etc. |

### 2.2 Coordinate System — CRITICAL

There are **two coordinate spaces** in play. Confusing them will produce wrong distances.

**Three.js world space** — what the `onClick` event gives you via `e.point`. This is scaled
and offset by the model loader.

**Normalized / stored space** — what is saved in Firestore as `positions.corpo`. This is
derived by reversing the model's runtime scale and Y-offset.

The conversion (from `PointPlacementScene.tsx` lines 78–94):
```
rawX = e.point.x / derivedScale
rawY = e.point.y / derivedScale - 95   ← corpo-specific Y offset
rawZ = e.point.z / derivedScale
```

`derivedScale` is the scale the model applies at runtime (`targetHeight / size.y`, where
`targetHeight = 1.8`). It is captured by the `ScaleCapturer` pattern already used in
`PointPlacementScene`.

**The proximity calculation must operate entirely in normalized/stored space.** Both the
tap position (after denormalization) and the stored `positions.corpo` values are in this
space.

When rendering the **HitMarker** (visual dot at tap location), you go in reverse: use
`getTransformedPosition()` to convert stored coords → world coords.

### 2.3 CUN-to-Model-Unit Conversion

```
1 CUN = 2 cm (adult finger width)
From pointMapping.ts arm heuristics: shoulderY = 1.45 units ≈ 140 cm
→ 1 model unit ≈ 96.5 cm
→ 1 CUN ≈ 2 / 96.5 ≈ 0.021 model units
```

This constant is `CUN_TO_MODEL_UNIT = 0.021`. Store it in a new `cunConversion.ts` utility
for easy future calibration.

### 2.4 Click Propagation in Three.js

`StingPointMarker` spheres call `e.stopPropagation()` on click. This means when a
**marker** is clicked, the event does NOT bubble to the model group. Therefore, the model
group's `onClick` handler for `onModelTap` only fires when the model **skin** is directly
clicked — no extra guard needed.

### 2.5 ModelComponents Already Support `onClick`

Both `HumanModel` and `CorpoModel` in `ModelComponents.tsx` accept an `onClick` prop and
pass it to their `<group>` element (lines 55–57 and 113–114). No changes to
`ModelComponents.tsx` needed.

### 2.6 Existing `BodyScene` does NOT pass `onClick` to models

Currently `BodyScene.tsx` renders `<HumanModel>` and `<CorpoModel>` without an `onClick`
prop. You will add one.

### 2.7 `TreatmentExecution` Free Selection Entry Point

When `protocol` is `undefined/null` and `customPoints` is empty, the component currently
renders an empty point list. Proximity Tap replaces this empty state with the IDLE CTA.

The `appConfig` is already fetched from `cfg_app_config/main` (lines 112–124). Read new
settings from `appConfig?.treatmentSettings?.proximityResultsCount` etc.

---

## 3. New Files to Create

### 3.1 `src/utils/cunConversion.ts`

```typescript
/**
 * CUN (寸) is a traditional Chinese anatomical unit of measurement.
 * 1 CUN = width of the middle finger ≈ 2 cm for an adult.
 *
 * Calibration source: pointMapping.ts arm alignment heuristics.
 * shoulderY = 1.45 model units ≈ 140 cm (adult shoulder height)
 * → 1 model unit ≈ 96.5 cm
 * → 1 CUN (2 cm) ≈ 2 / 96.5 ≈ 0.021 model units.
 *
 * To re-calibrate: measure the stored positions.corpo.y of a point at a known
 * anatomical height (e.g., crown of head, navel, sole of foot) and compare
 * to the real-world cm height, then update CUN_TO_MODEL_UNIT accordingly.
 */
export const CUN_TO_MODEL_UNIT = 0.021;

/** Convert a distance in CUN to normalized model units. */
export const cunToModelUnits = (cun: number): number => cun * CUN_TO_MODEL_UNIT;
```

---

### 3.2 `src/utils/pointsCache.ts`

The cache lives at **module scope** — it persists across React component mounts/unmounts
for the entire browser session. A caretaker treating multiple patients in one session will
benefit from cached data on the second patient onwards.

```typescript
import { StingPoint } from '../types/apipuncture';

interface CacheEntry {
  data: StingPoint[];
  fetchedAt: number; // Date.now()
}

let cache: CacheEntry | null = null;

/**
 * Returns cached points if they are still within the TTL window, or null if
 * expired / nothing cached yet.
 * @param ttlMinutes — from appConfig.treatmentSettings.pointsCacheTTLMinutes
 */
export function getCachedPoints(ttlMinutes: number): StingPoint[] | null {
  if (!cache) return null;
  const ageMs = Date.now() - cache.fetchedAt;
  if (ageMs > ttlMinutes * 60_000) {
    cache = null; // expired → trigger fresh fetch
    return null;
  }
  return cache.data;
}

/**
 * Stores a freshly-fetched full point list.
 */
export function setCachedPoints(points: StingPoint[]): void {
  cache = { data: points, fetchedAt: Date.now() };
}

/**
 * Force-invalidate the cache (e.g., after an admin saves changes to points).
 */
export function invalidatePointsCache(): void {
  cache = null;
}
```

---

### 3.3 `src/utils/findNearestPoints.ts`

```typescript
import { StingPoint } from '../types/apipuncture';
import { CUN_TO_MODEL_UNIT } from './cunConversion';

export interface ProximityResult {
  point: StingPoint;
  distance: number;      // in normalized model units
  distanceCun: number;   // in CUN (for optional display)
}

/**
 * Returns up to `maxResults` StingPoints whose positions.corpo coordinate
 * falls within `radiusCun` CUN of the tapped position.
 *
 * Results are sorted by distance (closest first).
 * Returns an empty array if no points exist within the radius.
 *
 * IMPORTANT: `tap` must be in normalized/stored coordinate space
 * (i.e., e.point / derivedScale with corpo Y-offset of 95 subtracted),
 * matching how positions.corpo values are stored in Firestore.
 *
 * Only points with a valid positions.corpo entry are considered.
 */
export function findNearestPoints(
  tap: { x: number; y: number; z: number },
  allPoints: StingPoint[],
  maxResults: number,
  radiusCun: number
): ProximityResult[] {
  const radiusModelUnits = radiusCun * CUN_TO_MODEL_UNIT;

  return allPoints
    .filter(p => p.positions?.corpo)
    .map(p => {
      const pos = p.positions!.corpo!;
      const dx = pos.x - tap.x;
      const dy = pos.y - tap.y;
      const dz = pos.z - tap.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return {
        point: p,
        distance,
        distanceCun: distance / CUN_TO_MODEL_UNIT,
      };
    })
    .filter(r => r.distance <= radiusModelUnits) // apply radius gate
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults);
}
```

---

## 4. Files to Modify

### 4.1 `src/config/appConfigSchema.ts`

Add three entries inside the `treatmentSettings.children` object, after the existing
`enableAISuggestions` entry (around line 121):

```typescript
proximityResultsCount: {
  label: 'Proximity Tap — Max Results',
  description: 'Maximum number of nearest acupuncture points to display when a practitioner taps the 3D model in Free Selection mode.',
  type: 'number',
  defaultValue: 5,
},
proximitySearchRadiusCun: {
  label: 'Proximity Tap — Search Radius (CUN)',
  description: 'Only points within this radius (in CUN, where 1 CUN ≈ 2 cm) of the tapped location will be shown. Default: 3 CUN ≈ 6 cm.',
  type: 'number',
  defaultValue: 3,
},
pointsCacheTTLMinutes: {
  label: 'Point List Cache Duration (Minutes)',
  description: 'How long the locally cached acupuncture point list stays valid before being refreshed from the database. Applies across all patients in one session.',
  type: 'number',
  defaultValue: 60,
},
```

> **Note:** `ApplicationSettings.tsx` renders the entire schema dynamically. Adding entries
> here is sufficient — no other changes needed to `ApplicationSettings.tsx`.

---

### 4.2 `src/components/BodyScene.tsx`

#### Step A — Extend `BodySceneProps` interface (lines 15–23)

```typescript
interface BodySceneProps {
  protocol: Protocol | null;
  onPointSelect: (point: StingPoint) => void;
  activePointId: string | null;
  isRolling: boolean;
  selectedModel: 'xbot' | 'corpo';
  resetTrigger?: number;
  sensitivityColorMap?: Record<string, string>;
  // NEW props:
  onModelTap?: (normalizedPos: { x: number; y: number; z: number }) => void;
  tapPosition?: { x: number; y: number; z: number } | null;
}
```

#### Step B — Add imports at the top of the file

```typescript
import { getTransformedPosition } from '../utils/pointMapping';
```

#### Step C — Add a `HitMarker` local component (before the `BodyScene` function)

```tsx
/**
 * Renders an orange sphere at the position the practitioner tapped.
 * `position` is in normalized/stored coordinate space (positions.corpo format).
 * getTransformedPosition converts it back to Three.js world coords.
 */
const HitMarker: React.FC<{ position: { x: number; y: number; z: number } }> = ({ position }) => {
  const world = getTransformedPosition(
    { code: 'TAP', positions: { corpo: position } },
    'corpo'
  );
  return (
    <mesh position={[world.x, world.y, world.z]}>
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
```

#### Step D — Extend the `BodyScene` function signature

Add `onModelTap` and `tapPosition` to the destructured props:

```typescript
const BodyScene: React.FC<BodySceneProps> = ({
  protocol, onPointSelect, activePointId, isRolling,
  selectedModel, resetTrigger, sensitivityColorMap,
  onModelTap, tapPosition   // NEW
}) => {
```

#### Step E — Add ScaleCapturer state and click handler

Inside the `BodyScene` function body, after the existing `useState` / `useRef` declarations:

```typescript
const [derivedScale, setDerivedScale] = React.useState(1);

const ScaleCapturer = ({ parentScale = 1 }: { parentScale?: number }) => {
  React.useEffect(() => { setDerivedScale(parentScale); }, [parentScale]);
  return null;
};

const handleModelBodyClick = React.useCallback((e: any) => {
  if (!onModelTap) return;
  // StingPointMarker spheres call e.stopPropagation() so this fires only
  // when the model skin is directly tapped — no additional guard needed.
  const point = e.point;
  const rawX = point.x / derivedScale;
  let   rawY = point.y / derivedScale;
  const rawZ = point.z / derivedScale;
  rawY -= 95; // reverse corpo legacy Y offset (see pointMapping.ts)
  onModelTap({ x: rawX, y: rawY, z: rawZ });
}, [onModelTap, derivedScale]);
```

#### Step F — Pass `onClick` and `ScaleCapturer` to model components

Replace the entire `<Suspense>` block (lines 117–168) with:

```tsx
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
  <ContactShadows position={[0, 0, 0]} opacity={0.3} scale={15} blur={3} far={10} resolution={512} color="#000000" />
</Suspense>
```

> **Important:** `ScaleCapturer` must be a direct child of `HumanModel`/`CorpoModel`
> so that `React.cloneElement` passes it `parentScale`. See `PointPlacementScene.tsx`
> lines 98–116 for the exact pattern.
>
> **Important:** `HitMarker` only belongs inside the `CorpoModel` block. It uses
> `getTransformedPosition(..., 'corpo')` — placing it in `HumanModel` would produce
> wrong positions.

---

### 4.3 `src/components/TreatmentExecution.tsx`

#### Step A — Add new imports

```typescript
import { collection, getDocs } from 'firebase/firestore';
// doc and getDoc are likely already imported — add collection and getDocs
import { RefreshCw } from 'lucide-react';
import { getCachedPoints, setCachedPoints } from '../utils/pointsCache';
import { findNearestPoints } from '../utils/findNearestPoints';
```

#### Step B — Add Proximity Tap state (after `appConfig` state, ~line 110)

```typescript
type ProxTapMode = 'idle' | 'loading' | 'results' | 'empty-radius';
const [proxTapMode, setProxTapMode]         = React.useState<ProxTapMode>('idle');
const [tapPosition, setTapPosition]         = React.useState<{ x: number; y: number; z: number } | null>(null);
const [candidatePoints, setCandidatePoints] = React.useState<StingPoint[]>([]);
```

#### Step C — Force Corpo model in Free Selection

Add a new `useEffect` after the existing effect blocks:

```typescript
// Lock to Corpo model in Free Selection (Proximity Tap uses Corpo coords only)
useEffect(() => {
  if (!protocol) {
    setSelectedModel('corpo');
  }
}, [protocol]);
```

#### Step D — Add tap handler and clear handler (after `handleRemoveStungPoint`)

```typescript
const handleModelTap = useCallback(async (pos: { x: number; y: number; z: number }) => {
  if (protocol) return; // only active in Free Selection
  setProxTapMode('loading');
  setTapPosition(pos);

  const ttl    = appConfig?.treatmentSettings?.pointsCacheTTLMinutes    ?? 60;
  const maxN   = appConfig?.treatmentSettings?.proximityResultsCount     ?? 5;
  const radius = appConfig?.treatmentSettings?.proximitySearchRadiusCun  ?? 3;

  let allPoints = getCachedPoints(ttl);
  if (!allPoints) {
    try {
      const snap = await getDocs(collection(db, 'cfg_acupuncture_points'));
      allPoints = snap.docs.map(d => ({ ...d.data(), id: d.id } as StingPoint));
      setCachedPoints(allPoints);
    } catch (err) {
      console.error('Proximity Tap: failed to fetch all points', err);
      setProxTapMode('idle');
      return;
    }
  }

  const results = findNearestPoints(pos, allPoints, maxN, radius);
  setCandidatePoints(results.map(r => r.point));
  setProxTapMode(results.length === 0 ? 'empty-radius' : 'results');
}, [protocol, appConfig]);

const handleClearAndRestart = useCallback(() => {
  setProxTapMode('idle');
  setTapPosition(null);
  setCandidatePoints([]);
  // stungPoints intentionally NOT cleared — they accumulate across taps
}, []);
```

#### Step E — Update `displayedPoints` (~line 245)

Replace:
```typescript
const displayedPoints = hydratedProtocol?.points.filter(p => {
    if (selectedSensitivity === 'all') return true;
    const pointLevel = normalizeSensitivity(p.sensitivity);
    const selectedLevel = normalizeSensitivity(selectedSensitivity);
    return pointLevel === selectedLevel;
}) || [];
```

With:
```typescript
const displayedPoints: StingPoint[] = protocol
  ? (hydratedProtocol?.points.filter(p => {
      if (selectedSensitivity === 'all') return true;
      const pointLevel = normalizeSensitivity(p.sensitivity);
      const selectedLevel = normalizeSensitivity(selectedSensitivity);
      return pointLevel === selectedLevel;
    }) ?? [])
  : proxTapMode === 'results'
    ? candidatePoints
    : [];
```

#### Step F — Update the left panel UI inside `<div className={styles.pointsPanel}>`

**1. Wrap the model switcher** so it only shows in protocol mode:

```tsx
{!!protocol && (
  <div className={styles.modelSwitcher}>
    <button
      className={`${styles.modelTab} ${selectedModel === 'xbot' ? styles.modelTabActive : ''}`}
      onClick={() => setSelectedModel('xbot')}
    ><T>Xbot</T></button>
    <button
      className={`${styles.modelTab} ${selectedModel === 'corpo' ? styles.modelTabActive : ''}`}
      onClick={() => setSelectedModel('corpo')}
    ><T>Corpo</T></button>
  </div>
)}
```

**2. Insert Proximity Tap state UI** before `<div className={styles.pointsList}>`:

```tsx
{!protocol && proxTapMode === 'idle' && (
  <div className={styles.proxTapCTA}>
    <MousePointerClick size={28} />
    <p><T>Tap the 3D model to find nearby acupuncture points</T></p>
  </div>
)}

{!protocol && proxTapMode === 'loading' && (
  <div className={styles.proxTapLoading}>
    <Loader size={18} className={styles.spinner} />
    <span><T>Finding nearest points...</T></span>
  </div>
)}

{!protocol && proxTapMode === 'empty-radius' && (
  <div className={styles.proxTapEmpty}>
    <p><T>No acupuncture points found in this area.</T></p>
    <p><T>Try tapping a different location or increase the search radius in Settings.</T></p>
    <button className={styles.clearRestartBtn} onClick={handleClearAndRestart}>
      <RefreshCw size={14} /> <T>Try Again</T>
    </button>
  </div>
)}

{!protocol && proxTapMode === 'results' && (
  <button className={styles.clearRestartBtn} onClick={handleClearAndRestart}>
    <RefreshCw size={14} /> <T>Clear &amp; Restart</T>
  </button>
)}

{!!protocol && (
  <p className={styles.hintText}><T>Click a point to mark it as stung.</T></p>
)}
```

**3. Conditionally render the points list** — hide when IDLE or LOADING in Free Selection:

```tsx
{(!!protocol || proxTapMode === 'results' || proxTapMode === 'empty-radius') && (
  <div className={styles.pointsList}>
    {displayedPoints.map(p => {
      /* ... existing map content unchanged ... */
    })}
  </div>
)}
```

#### Step G — Pass new props to `<BodyScene>` (~line 430)

```tsx
<BodyScene
  protocol={hydratedProtocol ? { ...hydratedProtocol, points: displayedPoints } : null}
  onPointSelect={handlePointSelect}
  activePointId={activePointId}
  isRolling={isRolling}
  selectedModel={selectedModel}
  resetTrigger={resetTrigger}
  sensitivityColorMap={sensitivityColorMap}
  onModelTap={!protocol ? handleModelTap : undefined}
  tapPosition={!protocol ? tapPosition : null}
/>
```

---

### 4.4 `src/components/TreatmentExecution.module.css`

Append to the end of the file:

```css
/* ── Proximity Tap UI ──────────────────────────────── */

.proxTapCTA {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--spacing-lg);
  font-size: var(--font-size-sm);
}

.proxTapLoading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  padding: var(--spacing-md) var(--spacing-lg);
}

.proxTapEmpty {
  padding: var(--spacing-md) var(--spacing-lg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.clearRestartBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  margin: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-secondary-button-background, #f1f5f9);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  align-self: flex-start;
  transition: background 0.15s ease;
}

.clearRestartBtn:hover {
  background: var(--color-secondary-button-hover, #e2e8f0);
}
```

---

## 5. Complete File Inventory

| File | Action |
|---|---|
| `src/config/appConfigSchema.ts` | MODIFY — add 3 settings to `treatmentSettings.children` |
| `src/utils/cunConversion.ts` | **NEW** — CUN → model unit constant + helper |
| `src/utils/pointsCache.ts` | **NEW** — module-level cache singleton with TTL |
| `src/utils/findNearestPoints.ts` | **NEW** — radius-gated proximity sort |
| `src/components/BodyScene.tsx` | MODIFY — `onModelTap`/`tapPosition` props, ScaleCapturer, click handler, HitMarker |
| `src/components/TreatmentExecution.tsx` | MODIFY — state, handlers, displayedPoints, left panel UI, BodyScene props |
| `src/components/TreatmentExecution.module.css` | MODIFY — 4 new CSS classes |

**NOT touched:** `PointPlacementScene.tsx`, `PointsAdmin.tsx`, `StingPointMarker.tsx`,
`ModelComponents.tsx`, `ApplicationSettings.tsx`, `pointMapping.ts`

---

## 6. Known Gotchas

1. **`ScaleCapturer` child pattern.** `ModelComponents.tsx` uses `React.cloneElement` to
   inject `parentScale` into direct children. `ScaleCapturer` must be a direct child of
   `HumanModel`/`CorpoModel`, not nested further. See `PointPlacementScene.tsx` lines
   98–116 for the exact working pattern.

2. **`derivedScale` closure.** `handleModelBodyClick` captures `derivedScale` via
   `useCallback`. Ensure `derivedScale` is in the dependency array so the callback
   re-creates when scale changes after model load.

3. **Corpo-only HitMarker.** `HitMarker` uses `getTransformedPosition(..., 'corpo')` which
   applies the `+95` Y offset. Placing it inside the `HumanModel` block would produce wrong
   positions. Keep it in the `CorpoModel` block only.

4. **`e.stopPropagation()` already in StingPointMarker.** Marker clicks do NOT reach the
   group's `onClick`. No extra check is needed in `handleModelBodyClick`.

5. **`collection` import.** `TreatmentExecution.tsx` currently imports `doc, getDoc` from
   `firebase/firestore`. Add `collection, getDocs` to that same import.

6. **JSX entity.** Write `Clear &amp; Restart` not `Clear & Restart` inside JSX text to
   avoid parser warnings.

---

## 7. Verification Checklist

- [ ] Open Free Selection → IDLE CTA visible (tap icon + prompt text). No point markers. No model switcher tabs. Model is Corpo.
- [ ] Tap model surface → loading state appears briefly on first tap only (subsequent taps: instant).
- [ ] After tap → orange hit-marker appears at tap location. Left panel shows ≤N candidate points, sorted closest first. "Clear & Restart" button visible.
- [ ] Tap an area with no mapped points within radius → empty-radius message + "Try Again" button.
- [ ] Click a candidate point → it moves to "Stung Points" in right panel. Candidate list unchanged.
- [ ] Click "Clear & Restart" → IDLE state restored. Hit-marker gone. Candidates cleared. Stung points remain in right panel.
- [ ] Tap again → new hit-marker, new candidates.
- [ ] Open a protocol-based session → model switcher tabs visible. No Proximity Tap UI. `onModelTap` undefined. Behaviour identical to before this feature.
- [ ] ApplicationSettings → Treatment Process section shows 3 new number inputs.
- [ ] Set `proximityResultsCount = 2` → only 2 candidates shown.
- [ ] Set `proximitySearchRadiusCun = 0.5` → most taps return empty-radius.
- [ ] Set `pointsCacheTTLMinutes = 0` → loading indicator on every tap (cache always expired).
