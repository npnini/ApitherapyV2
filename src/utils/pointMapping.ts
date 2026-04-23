
import { StingPoint, Vector3Pos } from '../types/apipuncture';

/**
 * Shared logic for transforming stored coordinates to 3D world/group coordinates.
 * This ensures consistency between the Admin interface and the Treatment execution view.
 */
export const getTransformedPosition = (
  point: StingPoint | { code: string, positions: { xbot?: Vector3Pos, corpo?: Vector3Pos } },
  selectedModel: 'xbot' | 'corpo'
): Vector3Pos => {
  const raw = point.positions?.[selectedModel] || { x: 0, y: 0, z: 0 };

  // 1. Handle Corpo (anatomical) model transformation
  // The corpo model has a legacy offset of 95 units in Y space relative to its stored coordinates.
  if (selectedModel === 'corpo') {
    return {
      x: raw.x,
      y: raw.y + 95,
      z: raw.z
    };
  }

  // 2. Handle Xbot (mannequin) model transformation
  if (selectedModel === 'xbot') {
    // If the coordinate was manually placed in the 3D admin, we bypass the auto-alignment logic.
    if (raw.isManual) {
      return { x: raw.x, y: raw.y, z: raw.z };
    }

    let { x, y, z } = raw;

    // Automatic Arm Alignment Logic:
    // Moves points that are logically on arms (based on Meridian prefix) from the torso 
    // to the arms in the A-pose geometry.
    const armPrefixes = ['LI', 'LU', 'SI', 'HT', 'PC', 'TE'];
    const isArmPoint = armPrefixes.some(pref => point.code.startsWith(pref));

    if (isArmPoint && y < 1.4 && Math.abs(x) > 0.1) {
      const sign = Math.sign(x) || 1;
      const shoulderX = 0.18 * sign;
      const shoulderY = 1.45;

      const dx = x - shoulderX;
      const dy = y - shoulderY;

      const armLength = Math.sqrt(dx * dx + dy * dy);

      x = shoulderX + (armLength * sign);
      y = shoulderY - (armLength * 0.05);
      z += (armLength * 0.1);
    }
    
    return { x, y, z };
  }

  return raw;
};
