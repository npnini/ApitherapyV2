
export interface Vector3Pos {
  x: number;
  y: number;
  z: number;
}

export interface StingPoint {
  id: string;
  code: string;
  label: string;
  description: string;
  position: Vector3Pos;
}

export interface Protocol {
  id: string;
  name: string;
  summary: string;
  points: StingPoint[];
}
