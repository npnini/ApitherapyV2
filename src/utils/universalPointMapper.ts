
/**
 * Universal Point Mapper
 * Converts coordinates between 3D models (Corpo and Xbot)
 * based on bounding box normalization.
 */

export interface Vector3Pos {
    x: number;
    y: number;
    z: number;
}

// Corpo Bounding Box (Derived from extracted points)
const CORPO_BBOX = {
    min: { x: -30.56779800686468, y: -93.17999999999924, z: -9.299999999999985 },
    max: { x: 29.532201993135637, y: 71.89999999999985, z: 11.299999999999976 },
    size: { x: 60.10000000000032, y: 165.07999999999907, z: 20.59999999999996 },
    center: { x: -0.5177980068645223, y: -10.639999999999695, z: 1.0 }
};

// Xbot Bounding Box (Assumed normalized to 1.8 height, feet at y=0, centered)
// We estimate dimensions based on the same proportions as Corpo for 80% accuracy
const XBOT_HEIGHT = 1.8;
const XBOT_WIDTH = (CORPO_BBOX.size.x / CORPO_BBOX.size.y) * XBOT_HEIGHT;
const XBOT_DEPTH = (CORPO_BBOX.size.z / CORPO_BBOX.size.y) * XBOT_HEIGHT;

const XBOT_BBOX = {
    min: { x: -XBOT_WIDTH / 2, y: 0, z: -XBOT_DEPTH / 2 },
    max: { x: XBOT_WIDTH / 2, y: XBOT_HEIGHT, z: XBOT_DEPTH / 2 },
    size: { x: XBOT_WIDTH, y: XBOT_HEIGHT, z: XBOT_DEPTH },
    center: { x: 0, y: XBOT_HEIGHT / 2, z: 0 }
};

/**
 * Maps a point from Corpo coordinate system to Xbot coordinate system
 */
export const mapCorpoToXbot = (pos: Vector3Pos): Vector3Pos => {
    // Normalize to [0, 1] relative to Corpo BBox
    const nx = (pos.x - CORPO_BBOX.min.x) / CORPO_BBOX.size.x;
    const ny = (pos.y - CORPO_BBOX.min.y) / CORPO_BBOX.size.y;
    const nz = (pos.z - CORPO_BBOX.min.z) / CORPO_BBOX.size.z;

    // Project to Xbot BBox
    return {
        x: XBOT_BBOX.min.x + nx * XBOT_BBOX.size.x,
        y: XBOT_BBOX.min.y + ny * XBOT_BBOX.size.y,
        z: XBOT_BBOX.min.z + nz * XBOT_BBOX.size.z
    };
};

/**
 * Maps a point from Xbot coordinate system to Corpo coordinate system
 */
export const mapXbotToCorpo = (pos: Vector3Pos): Vector3Pos => {
    // Normalize to [0, 1] relative to Xbot BBox
    const nx = (pos.x - XBOT_BBOX.min.x) / XBOT_BBOX.size.x;
    const ny = (pos.y - XBOT_BBOX.min.y) / XBOT_BBOX.size.y;
    const nz = (pos.z - XBOT_BBOX.min.z) / XBOT_BBOX.size.z;

    // Project to Corpo BBox
    return {
        x: CORPO_BBOX.min.x + nx * CORPO_BBOX.size.x,
        y: CORPO_BBOX.min.y + ny * CORPO_BBOX.size.y,
        z: CORPO_BBOX.min.z + nz * CORPO_BBOX.size.z
    };
};
