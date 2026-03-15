
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
  longText?: { [key: string]: string };
  sensitivity?: 'Low' | 'Medium' | 'High';
  imageURL?: string;
  positions: {
    xbot?: Vector3Pos;
    corpo?: Vector3Pos;
  };
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
