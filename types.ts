
export interface PatientData {
  fullName: string;
  age: number;
  gender: string;
  condition: string;
  severity: 'mild' | 'moderate' | 'severe';
  allergiesConfirmed: boolean;
  notes: string;
}

export interface Protocol {
  id: string;
  name: string;
  description: string;
  recommendedPoints: string[];
}

export interface TreatmentPoint {
  id: string;
  name: string;
  position: [number, number, number]; // [x, y, z]
  description: string;
}

export interface SessionState {
  patient: PatientData | null;
  selectedProtocol: Protocol | null;
  appliedPoints: string[]; // IDs of points clicked on the 3D model
}
