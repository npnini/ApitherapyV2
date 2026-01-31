
import { TreatmentPoint, Protocol } from './types';

export const TREATMENT_POINTS: TreatmentPoint[] = [
  { id: 'gv14', name: 'GV14 (Dazhui)', position: [0, 1.5, -0.1], description: 'Main point for immune regulation' },
  { id: 'li4_l', name: 'LI4 Left (Hegu)', position: [0.6, 0.4, 0.1], description: 'Face and upper body relief' },
  { id: 'li4_r', name: 'LI4 Right (Hegu)', position: [-0.6, 0.4, 0.1], description: 'Face and upper body relief' },
  { id: 'st36_l', name: 'ST36 Left (Zusanli)', position: [0.3, -0.8, 0.2], description: 'Vital energy and leg joints' },
  { id: 'st36_r', name: 'ST36 Right (Zusanli)', position: [-0.3, -0.8, 0.2], description: 'Vital energy and leg joints' },
  { id: 'bl23_l', name: 'BL23 Left (Shenshu)', position: [0.2, 0.6, -0.2], description: 'Lower back and kidney support' },
  { id: 'bl23_r', name: 'BL23 Right (Shenshu)', position: [-0.2, 0.6, -0.2], description: 'Lower back and kidney support' },
  { id: 'gb30_l', name: 'GB30 Left (Huantiao)', position: [0.4, 0.0, -0.1], description: 'Hip joint and sciatica' },
  { id: 'gb30_r', name: 'GB30 Right (Huantiao)', position: [-0.4, 0.0, -0.1], description: 'Hip joint and sciatica' },
  { id: 'c7', name: 'C7 Vertebra', position: [0, 1.4, -0.15], description: 'Cervical pain and inflammation' },
  { id: 'l4', name: 'L4 Vertebra', position: [0, 0.3, -0.2], description: 'Lumbar support' },
];

export const PROTOCOLS: Protocol[] = [
  {
    id: 'p1',
    name: 'Arthritis Relief Protocol',
    description: 'Focuses on peripheral joints and local inflammation reduction.',
    recommendedPoints: ['st36_l', 'st36_r', 'li4_l', 'li4_r']
  },
  {
    id: 'p2',
    name: 'Immune Modulation Protocol',
    description: 'Systemic support for autoimmune conditions or chronic fatigue.',
    recommendedPoints: ['gv14', 'bl23_l', 'bl23_r']
  },
  {
    id: 'p3',
    name: 'Chronic Back Pain Protocol',
    description: 'Focuses on spinal alignment points and lumbar relief.',
    recommendedPoints: ['bl23_l', 'bl23_r', 'l4', 'c7']
  }
];
