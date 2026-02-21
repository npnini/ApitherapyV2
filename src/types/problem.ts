import { Timestamp } from 'firebase/firestore';

export interface Problem {
  id: string;
  name: { [key: string]: string };
  description: { [key: string]: string };
  protocolIds: string[];
  measureIds: string[];
  documentUrl?: { [key: string]: string } | string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}