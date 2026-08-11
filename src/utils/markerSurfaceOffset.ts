import * as THREE from 'three';

// World units — how far to nudge a marker off the skin so it isn't self-occluded
// by the immediately-local surface it sits on.
export const MARKER_OUTWARD_OFFSET = 0.02;

/**
 * Finds the true local outward surface normal near a world-space point by
 * raycasting into the body mesh from well outside it, along a naive guess
 * direction (radially out from the vertical axis). A pure axis-radial guess
 * breaks down in concave areas (spine groove, gluteal cleft) where it can
 * point further into a fold instead of away from the skin; using the actual
 * hit face's normal is accurate regardless of local concavity.
 * Falls back to the naive radial guess if nothing is hit.
 */
export function findSurfaceOffsetDirection(
  worldX: number, worldY: number, worldZ: number,
  corpoObj: THREE.Object3D
): THREE.Vector3 {
  const radial = Math.hypot(worldX, worldZ);
  const guess = new THREE.Vector3(
    radial > 1e-4 ? worldX / radial : 0,
    0,
    radial > 1e-4 ? worldZ / radial : 1
  );

  const farPoint = new THREE.Vector3(worldX, worldY, worldZ).addScaledVector(guess, 5);
  const target = new THREE.Vector3(worldX, worldY, worldZ);
  const rayDir = target.clone().sub(farPoint).normalize();

  corpoObj.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(farPoint, rayDir, 0, 10);
  const hits = raycaster.intersectObject(corpoObj, true);

  if (hits.length > 0 && hits[0].face) {
    const hit = hits[0];
    const worldNormal = hit.face!.normal.clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize();
    return worldNormal;
  }

  return guess;
}

/** Naive radial-from-vertical-axis fallback, used when there's no mesh available to raycast against. */
export function naiveRadialOffsetDirection(worldX: number, worldZ: number): THREE.Vector3 {
  const radial = Math.hypot(worldX, worldZ);
  return new THREE.Vector3(
    radial > 1e-4 ? worldX / radial : 0,
    0,
    radial > 1e-4 ? worldZ / radial : 1
  );
}
