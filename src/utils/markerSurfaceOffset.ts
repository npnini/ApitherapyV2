import * as THREE from 'three';

// World units — how far to nudge a marker off the skin so it isn't self-occluded
// by the immediately-local surface it sits on.
export const MARKER_OUTWARD_OFFSET = 0.02;

// How far to nudge the raycast probe off the exact vertical midline (x=0).
// Bilateral body meshes are typically built as a left/right mirror pair
// stitched together at x=0, which can leave a seam there (duplicate,
// zero-thickness, or inward-facing geometry). A ray traveling exactly
// within the x=0 plane — as every candidate direction below does for a
// point sitting exactly on the midline — can hit that seam ambiguously or
// miss the real surface entirely, producing a wrong or missing normal.
// Probing from just off the seam sidesteps it while staying close enough
// to the real point for the normal to still be accurate there.
const MIDLINE_SEAM_PROBE_EPSILON = 0.01;

/**
 * Finds the true local outward surface normal near a world-space point by
 * raycasting into the body mesh from well outside it. Tries a small set of
 * candidate "away from the body" directions — horizontal-radial (from the
 * vertical axis), straight up, and straight down — and keeps whichever
 * produces a hit closest to the actual point. A single horizontal-only guess
 * works for torso/limb points, but breaks down near the top of the head
 * (and other near-vertical surfaces), where "outward" is mostly vertical: a
 * purely horizontal raycast can miss the local surface entirely and return
 * an unrelated hit far from the real point, pushing the marker in the wrong
 * direction — sometimes into the mesh, rendering it invisible.
 * Falls back to the naive radial guess if nothing is hit.
 */
export function findSurfaceOffsetDirection(
  worldX: number, worldY: number, worldZ: number,
  corpoObj: THREE.Object3D
): THREE.Vector3 {
  corpoObj.updateMatrixWorld(true);
  const target = new THREE.Vector3(worldX, worldY, worldZ);
  const horizontalGuess = naiveRadialOffsetDirection(worldX, worldZ);
  const candidates = [horizontalGuess, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];

  // Probe from just off the midline seam (see MIDLINE_SEAM_PROBE_EPSILON)
  // when the point itself sits exactly on it; otherwise probe the real point.
  const probeTarget = Math.abs(worldX) < 1e-6
    ? target.clone().setX(MIDLINE_SEAM_PROBE_EPSILON)
    : target;

  let best: { normal: THREE.Vector3; distance: number } | null = null;

  for (const guess of candidates) {
    const farPoint = probeTarget.clone().addScaledVector(guess, 5);
    const rayDir = probeTarget.clone().sub(farPoint).normalize();
    const raycaster = new THREE.Raycaster(farPoint, rayDir, 0, 10);
    const hits = raycaster.intersectObject(corpoObj, true);

    if (hits.length > 0 && hits[0].face) {
      const hit = hits[0];
      const distance = hit.point.distanceTo(probeTarget);
      if (!best || distance < best.distance) {
        const worldNormal = hit.face!.normal.clone()
          .transformDirection(hit.object.matrixWorld)
          .normalize();
        best = { normal: worldNormal, distance };
      }
    }
  }

  return best ? best.normal : horizontalGuess;
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
