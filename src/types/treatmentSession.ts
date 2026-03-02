
export interface VitalSigns {
  systolic: number;
  diastolic: number;
  heartRate: number;
  outOfRange?: boolean;
}

/**
 * One executed protocol round within a treatment session.
 */
export interface ProtocolRound {
  protocolId: string;
  problemId: string;
  stungPointIds: string[];
  postRoundVitals?: Partial<VitalSigns>; // optional BP+HR after this round's stings
}

/**
 * A full treatment session (one visit) stored in the root `treatments` collection.
 * Document ID: {patientId}_{Date.now()} — composite key.
 */
export interface TreatmentSession {
  id?: string;                  // Firestore doc ID, populated after read

  // References
  patientId: string;            // FK → patients/{patientId}
  caretakerId: string;          // FK → users/{uid}

  // Pre-session data
  patientReport: string;        // case story entered at session opening
  preSessionVitals: Partial<VitalSigns>;  // BP + HR measured at session start
  measureReadingId?: string;    // FK → measured_values/{docId} written at session open

  // Protocol rounds (one entry per executed protocol)
  rounds: ProtocolRound[];

  // Post-session data
  finalVitals?: Partial<VitalSigns>;   // stinger-removal BP + HR (~15 min post session)
  finalNotes?: string;

  // Session metadata
  isSensitivityTest: boolean;   // true when this session forced the sensitivity protocol

  // Post-treatment patient response (reserved for future automation)
  patientFeedback?: string;
  patientFeedbackMeasureReadingId?: string; // FK → measured_values/{docId} written by patient

  // Firestore timestamps
  createdTimestamp?: any;
  updatedTimestamp?: any;
}
