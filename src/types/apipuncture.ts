
export interface Vector3Pos {
  x: number;
  y: number;
  z: number;
}

export interface StingPoint {
  id: string;
  code: string;
  label: { [key: string]: string };
  description: { [key: string]: string };
  position: Vector3Pos;
  documentUrl?: { [key: string]: string } | string;
  status: 'active' | 'inactive';
  reference_count: number;
}

export interface Protocol {
  id: string;
  name: { [key: string]: string };
  description: { [key: string]: string };
  rationale: { [key: string]: string };
  points: StingPoint[];
  status: 'active' | 'inactive';
  reference_count: number;
}
