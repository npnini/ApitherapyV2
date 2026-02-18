import { Timestamp } from 'firebase/firestore';

export interface Problem {
  id: string;
  name: string;
  description: string;
  protocolIds: string[];
  measureIds: string[];
  documentUrl?: string | { [key: string]: string };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}