import { Timestamp } from 'firebase/firestore';

export type PointGroupType = 'meridian' | 'ex-point';
export type PointGroupLaterality = 'Paired' | 'Midline-front' | 'Midline-back' | 'Unilateral';

export interface PointGroup {
  id: string;
  code: string;
  name: string;
  description: string;
  type: PointGroupType;
  laterality: PointGroupLaterality;
  comment?: string;
  status: 'active' | 'inactive';
  reference_count: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
