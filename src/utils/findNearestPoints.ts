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

  const mapped = allPoints
    .filter(p => p.positions?.corpo)
    .map(p => {
      const pos = p.positions!.corpo!;
      const dx1 = pos.x - tap.x;
      const dx2 = (-pos.x) - tap.x; // Bilateral check
      const dy = pos.y - tap.y;
      const dz = pos.z - tap.z;
      
      const dist1 = Math.sqrt(dx1 * dx1 + dy * dy + dz * dz);
      const dist2 = Math.sqrt(dx2 * dx2 + dy * dy + dz * dz);
      const distance = Math.min(dist1, dist2);
      
      return {
        point: p,
        distance,
        distanceCun: distance / CUN_TO_MODEL_UNIT,
      };
    });

  const results = mapped
    .filter(r => r.distance <= radiusModelUnits)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults);
    
  return results;
}
