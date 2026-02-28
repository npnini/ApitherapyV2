
export interface VitalSigns {
  systolic: number;
  diastolic: number;
  heartRate: number;
  outOfRange?: boolean;
}

export interface TreatmentSession {
  id?: string;
  patientId: string;
  protocolId: string;
  protocolName: string | Record<string, string>;
  caretakerId: string;
  date?: string; // Keep for legacy but mark as optional
  timestamp?: any;
  patientReport: string;
  preStingVitals?: Partial<VitalSigns>;
  postStingVitals?: Partial<VitalSigns>;
  finalVitals?: Partial<VitalSigns>;
  stungPoints: string[];
  finalNotes?: string;
}
