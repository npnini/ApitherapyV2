
import { StingPoint, Vector3Pos } from '../types/apipuncture';

/**
 * Shared logic for transforming stored coordinates to 3D world/group coordinates.
 * This ensures consistency between the Admin interface and the Treatment execution view.
 */
export const getTransformedPosition = (
  point: StingPoint | { code: string, positions: { corpo?: Vector3Pos } },
): Vector3Pos => {
  const raw = point.positions?.corpo || { x: 0, y: 0, z: 0 };

  // The corpo model has a legacy offset of 95 units in Y space relative to its stored coordinates.
  return {
    x: raw.x,
    y: raw.y + 95,
    z: raw.z
  };
};
