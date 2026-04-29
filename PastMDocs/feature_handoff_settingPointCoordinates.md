# Feature Handoff: Points Management 3D Mapping Upgrade

## Overview
The goal of this feature is to upgrade the `PointsAdmin` component from a basic form into a professional 3D mapping tool. This will allow administrators to visually place acupuncture points on a high-fidelity anatomical model (`corpo`) and a mannequin model (`xbot`), capturing their exact 3D coordinates.

## Core Technical Context

### 1. Coordinate System & Normalization
The application uses a standardized 3D coordinate system defined in `BodyScene.tsx`:
- **Origin (0,0,0)**: Located at the floor level (feet soles) and centered horizontally between the legs.
- **Y-Axis**: Vertical (Up is positive, 0 is the floor).
- **X-Axis**: Lateral (Patient's Left is positive, Right is negative).
- **Z-Axis**: Depth (Forward/Chest is positive, Backward/Spine is negative).

**Normalization Logic**:
Upon loading, models are normalized:
1. Scaled to exactly **1.8 meters** total height.
2. Centered horizontally (X and Z) using the bounding box center.
3. Grounded (Y) by setting the minimum Y of the bounding box to 0.

### 2. Model Poses
- **Corpo (Anatomical)**: A realistic muscle/skin model in **A-Pose** (arms down at the sides). This is the **Source of Truth** for clinical placement.
- **Xbot (Mannequin)**: A simplified silhouette model in **T-Pose** (arms out horizontally).

### 3. Data Structure
Points are stored in the `cfg_acupuncture_points` collection in Firestore. The `StingPoint` interface includes:
```typescript
positions: {
  corpo: { x: number; y: number; z: number };
  xbot: { x: number; y: number; z: number };
}
```

## Proposed UI/UX Workflow

### 1. Split-Screen Layout
The `EditPointForm` modal should be widened (approx. `1200px` or `95vw`) and split into two columns:
- **Left Panel**: Existing metadata fields (Code, Labels, Description, Long Text, Status).
- **Right Panel**: A 3D Viewport with the following features:
    - **Toggle Buttons**: Switch between `Corpo` and `Xbot` models.
    - **OrbitControls**: Standard zoom, pan, tilt, and roll.
    - **Freeze Button**: Lock the camera to allow stable pin placement.

### 2. Interactive Pinning (Raycasting)
Implement a click listener on the 3D model surface:
- When a user clicks the model, the "Pin" (a small 3D sphere) moves to that exact surface point.
- The corresponding XYZ fields in the left-hand form update immediately.
- **Logic**:
    - If viewing `Corpo`, update `positions.corpo`.
    - If viewing `Xbot`, update `positions.xbot`.

### 3. Sync & Refine (The "Seed and Refine" Strategy)
Due to the different poses (A-pose vs T-pose), coordinates do not map 1:1, especially on the arms.
- **Sync Button**: Add a button "Sync Xbot from Corpo". 
- **Goal**: The goal of the sync is to "seed" the pin in the correct general anatomical region so the user can then refine it, rather than starting from (0,0,0).
- **Refinement**: After syncing, the admin MUST switch to the X-Bot view and use the mouse to click/drag the pin (by clicking the new location) to the final correct spot on the mannequin surface.

## Technical Specifications for Conversion

When the user clicks "Sync Xbot from Corpo", the following logic should be applied:

1.  **Y-Coordinate (Vertical)**: Use a 1:1 mapping. Both models are normalized to 1.8m height.
2.  **X/Z-Coordinates (Horizontal/Depth)**:
    -   **Torso/Head/Legs**: Use a 1:1 mapping. Both models are centered at X=0, Z=0.
    -   **Arms (The A-to-T Problem)**: Usually $|X| > 0.15$ and $Y > 0.8$. 
    -   **Instruction**: Use 1:1 as the base. The agent should be informed that for arms, the pin will land "inside the torso" on the Xbot, and the user **must** manually move it out to the arm in the T-pose.

3.  **Surface Snapping**:
    -   The coordinate should ideally "snap" to the nearest vertex on the surface of the target model's mesh to ensure the pin sits on the skin and not floating inside the body.

## Implementation Steps for the New Agent

### Phase 1: CSS Overhaul
- Modify `PointsAdmin.module.css` to handle the `.modalContent` expansion and the `.splitLayout` container.

### Phase 2: 3D Mapping Component
- Create a `PointPlacementScene` helper component inside `PointsAdmin.tsx`.
- Use `@react-three/fiber` and `@react-three/drei`.
- Include `Environment`, `ContactShadows`, and `OrbitControls`.

### Phase 3: Selection Logic
- Implement the `onPointerDown` or `onClick` handler on the model mesh.
- Extract `event.point` and pass it back to the `EditPointForm` via a callback.

### Phase 4: Sync Utility
- Implement a helper function to copy/transform coordinates between the model types.

## Files to Modify
- `src/components/PointsAdmin.tsx`
- `src/components/PointsAdmin.module.css`

## Critical Constraints
- **Do not** allow initial pinning on Xbot if Corpo doesn't have a location (optional but recommended to enforce the clinical Source of Truth).
- Always show the pin on the model if coordinates exist in the form state.
