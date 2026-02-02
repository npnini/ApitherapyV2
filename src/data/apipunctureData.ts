
import { Protocol, StingPoint } from '../types/apipuncture';

const ALL_POINTS: Record<string, StingPoint> = {
  ST36: { 
    id: 'pt-st36', 
    code: 'ST36', 
    label: 'Zusanli', 
    description: 'Leg Three Miles: Immunity and vitality. Below the knee.', 
    position: { x: 0.14, y: 0.48, z: 0.12 } 
  },
  LI4: { 
    id: 'pt-li4', 
    code: 'LI4', 
    label: 'Hegu', 
    description: 'Joining Valley: Face and pain relief. On the hand.', 
    position: { x: 0.42, y: 0.82, z: 0.08 } 
  },
  GV14: { 
    id: 'pt-gv14', 
    code: 'GV14', 
    label: 'Dazhui', 
    description: 'Great Hammer: Clearing heat and nervous system. Base of neck.', 
    position: { x: 0, y: 1.55, z: -0.12 } 
  },
  LV3: { 
    id: 'pt-lv3', 
    code: 'LV3', 
    label: 'Taichong', 
    description: 'Great Surge: Detox and liver qi. On the foot.', 
    position: { x: 0.08, y: 0.04, z: 0.18 } 
  },
  BL23: { 
    id: 'pt-bl23', 
    code: 'BL23', 
    label: 'Shenshu', 
    description: 'Kidney Shu: Lower back pain and adrenal support.', 
    position: { x: 0.12, y: 0.92, z: -0.15 } 
  },
  SP6: { 
    id: 'pt-sp6', 
    code: 'SP6', 
    label: 'Sanyinjiao', 
    description: 'Three Yin Intersection: Hormonal balance. Inner ankle.', 
    position: { x: 0.05, y: 0.18, z: 0.02 } 
  },
};

export const APITHERAPY_PROTOCOLS: Protocol[] = [
  {
    id: 'immunity',
    name: 'Immune Optimization',
    summary: 'Focuses on core vitality and defensive Qi.',
    points: [ALL_POINTS.ST36, ALL_POINTS.GV14, ALL_POINTS.LI4]
  },
  {
    id: 'detox',
    name: 'Detox & Vitality',
    summary: 'Aimed at metabolic clearance and energy regulation.',
    points: [ALL_POINTS.LV3, ALL_POINTS.SP6, ALL_POINTS.ST36]
  },
  {
    id: 'pain',
    name: 'Pain Management',
    summary: 'Localized and systemic points to reduce inflammation.',
    points: [ALL_POINTS.LI4, ALL_POINTS.BL23, ALL_POINTS.ST36]
  },
  {
    id: 'regulation',
    name: 'Systemic Regulation',
    summary: 'Balancing the nervous system and hormonal intersections.',
    points: [ALL_POINTS.GV14, ALL_POINTS.BL23, ALL_POINTS.SP6]
  }
];

export const MANNEQUIN_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/Xbot.glb';
