# 3D Human Model Migration & Point Synchronization

This plan outlines the steps to support multi-model 3D visualization, allowing users to choose between the original "Xbot" mannequin and the new anatomically accurate "Corpo" model.

## User Review Required

> [!IMPORTANT]
> **Model-Specific Coordinates**: You are correct. Coordinates are relative to the model's geometry. A point like "ST36" must have separate entries (or positions) for Xbot and Corpo.

## Proposed Changes

### [Data Model Updates]
- **[MODIFY] [AppUser]**: Add `preferredModel: 'xbot' | 'corpo'`.
- **[MODIFY] [StingPoint]**: Add `modelId: 'xbot' | 'corpo'`.
    - **Parity Notice**: Points currently exist for Xbot. The `acu-master` import will create points for Corpo. Until you manually map Xbot coordinates for the new points (or vice-versa), switching models will show different sets of available points.

### [Phase 1: Universal Point Mapper]
To ensure all 300+ points from the Corpo model are available on the Xbot model, we will implement a "Universal Point Mapper" utility:
1.  **Normalization**: Map Corpo point `(x, y, z)` to a normalized `(0-1)` coordinate within its bounding box.
2.  **Projection**: Apply these normalized values to the Xbot bounding box to find a "target" starting point.
3.  **Surface Snapping**: Use `THREE.Raycaster` from the model's center toward the target point to find the exact intersection with the Xbot mesh surface.
4.  **Persistence**: The resulting coordinates will be saved to Firestore with `modelId: 'xbot'`.

> [!TIP]
> This automation saves months of manual work. Users can use the "Doc Link" feature for precise anatomical confirmation if the 3D marker is slightly off.

### [Data Migration (Firestore)]
- **[MODIFY] [cfg_acupuncture_points]**: 
    - Tag existing points with `modelId: 'xbot'`.
    - Import `acu-master` points with `modelId: 'corpo'`.
- **[MODIFY] [cfg_protocols]**: Protocols will store point **codes** (e.g., "ST36"). The UI will fetch the coordinate document matching the current `modelId`.

### [Frontend Components]
#### [MODIFY] [BodyScene.tsx]
- Accept `modelId` prop.
- Conditional load: `Xbot.glb` vs `corpo.obj`.
- **Consistent Controls**: Ensure `auto-rotate`, `zoom`, `pan`, and `orbit` work identically for both models by normalizing camera target and distance based on model dimensions.

#### [MODIFY] [TreatmentExecution.tsx]
- **Runtime Switching**: Provide a UI toggle (e.g., in the model container header) to switch models on the fly during a session.
- **Filtering**: Display points matching the active `modelId`.
- **Availability Warning**: If a point in the selected protocol is unavailable for the current model, show a clear warning or fall back to a default location if the mapper has not run.

## Verification Plan
1. **Switching**: Verify that switching to "Corpo" displays the new points from `acu-master`.
2. **Backward Compatibility**: Verify that switching back to "Xbot" displays the original points correctly.
