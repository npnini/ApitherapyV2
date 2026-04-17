
export interface VitalSigns {
  systolic: number;
  diastolic: number;
  heartRate: number;
  outOfRange?: boolean;
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
  preTreatmentVitals: Partial<VitalSigns>;  // BP + HR measured at session start
  preTreatmentMeasureReadingId?: string;    // FK → measured_values/{docId} written at session open
  preTreatmentImage?: string;   // URL of uploaded photo from session opening

  // Session metadata
  isSensitivityTest: boolean;   // true when this session forced the sensitivity protocol

  // Flattened Treatment Data
  status: 'Incomplete' | 'Completed';
  protocolIds: string[];        // Replaces singular protocolId
  problemIds: string[];         // Replaces singular problemId
  stungPointIds: string[];      // List of stung points in this session

  // Post-session data
  postStingingVitals?: Partial<VitalSigns>; // BP + HR measured after all stings, before removal
  finalVitals?: Partial<VitalSigns>;   // stinger-removal BP + HR (~15 min post session)
  finalNotes?: string;
  freeProtocolUsed?: boolean;  // true when the caretaker used the free protocol selection path

  // Post-treatment patient response (reserved for future automation)
  patientFeedback?: string;
  patientFeedbackMeasureReadingId?: string; // FK → measured_values/{docId} written by patient

  // Firestore timestamps
  createdTimestamp?: any;
  updatedTimestamp?: any;

  treatmentNumber?: number;     // Stable sequence number (1, 2, 3...)
}

