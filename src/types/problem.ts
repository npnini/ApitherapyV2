
import { Timestamp } from 'firebase/firestore';

export interface Problem {
  id: string;
  name: string;
  description: string;
  protocolIds: string[];
  measureIds: string[];
  documentUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
