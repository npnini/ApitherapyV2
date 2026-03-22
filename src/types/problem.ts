import { Timestamp } from 'firebase/firestore';

export interface Problem {
  id: string;
  name: { [key: string]: string };
  description: { [key: string]: string };
  protocolId?: string;
  protocolIds?: string[];
  measureIds: string[];
  documentUrl?: { [key: string]: string } | string;
  status: 'active' | 'inactive';
  reference_count: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}