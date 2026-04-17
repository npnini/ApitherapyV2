
import { Protocol, StingPoint } from '../types/apipuncture';

const ALL_POINTS: Record<string, StingPoint> = {
  ST36: {
    id: 'pt-st36',
    code: 'ST36',
    label: { en: 'Zusanli', he: 'צוסאנלי' },
    description: { en: 'Leg Three Miles: Immunity and vitality. Below the knee.', he: 'חוסן וחיוניות. מתחת לברך.' },
    positions: { xbot: { x: 0.14, y: 0.48, z: 0.12 } },
    status: 'active',
    reference_count: 0
  },
  LI4: {
    id: 'pt-li4',
    code: 'LI4',
    label: { en: 'Hegu', he: 'הגו' },
    description: { en: 'Joining Valley: Face and pain relief. On the hand.', he: 'שיכוך כאבים. על היד.' },
    positions: { xbot: { x: 0.42, y: 0.82, z: 0.08 } },
    status: 'active',
    reference_count: 0
  },
  GV14: {
    id: 'pt-gv14',
    code: 'GV14',
    label: { en: 'Dazhui', he: 'דאג׳וויי' },
    description: { en: 'Great Hammer: Clearing heat and nervous system. Base of neck.', he: 'מערכת העצבים. בסיס הצוואר.' },
    positions: { xbot: { x: 0, y: 1.55, z: -0.12 } },
    status: 'active',
    reference_count: 0
  },
  LV3: {
    id: 'pt-lv3',
    code: 'LV3',
    label: { en: 'Taichong', he: 'טאיצ׳ונג' },
    description: { en: 'Great Surge: Detox and liver qi. On the foot.', he: 'ניקוי רעלים. על כף הרגל.' },
    positions: { xbot: { x: 0.08, y: 0.04, z: 0.18 } },
    status: 'active',
    reference_count: 0
  },
  BL23: {
    id: 'pt-bl23',
    code: 'BL23',
    label: { en: 'Shenshu', he: 'שנשו' },
    description: { en: 'Kidney Shu: Lower back pain and adrenal support.', he: 'תמיכה בגב תחתון.' },
    positions: { xbot: { x: 0.12, y: 0.92, z: -0.15 } },
    status: 'active',
    reference_count: 0
  },
  SP6: {
    id: 'pt-sp6',
    code: 'SP6',
    label: { en: 'Sanyinjiao', he: 'סאנינג׳יאו' },
    description: { en: 'Three Yin Intersection: Hormonal balance. Inner ankle.', he: 'איזון הורמונלי. קרסול פנימי.' },
    positions: { xbot: { x: 0.05, y: 0.18, z: 0.02 } },
    status: 'active',
    reference_count: 0
  },
};

export const APITHERAPY_PROTOCOLS: Protocol[] = [
  {
    id: 'immunity',
    name: { en: 'Immune Optimization', he: 'אופטימיזציה חיסונית' },
    description: { en: 'Focuses on core vitality and defensive Qi.', he: 'התמקדות באנרגיית הגנה.' },
    rationale: { en: 'General health and immune support.', he: 'חיזוק מערכת החיסון.' },
    points: [ALL_POINTS.ST36, ALL_POINTS.GV14, ALL_POINTS.LI4],
    status: 'active',
    reference_count: 0
  },
  {
    id: 'detox',
    name: { en: 'Detox & Vitality', he: 'ניקוי רעלים וחיוניות' },
    description: { en: 'Aimed at metabolic clearance and energy regulation.', he: 'איזון מטבולי.' },
    rationale: { en: 'Liver support and detox.', he: 'תמיכה בכבד.' },
    points: [ALL_POINTS.LV3, ALL_POINTS.SP6, ALL_POINTS.ST36],
    status: 'active',
    reference_count: 0
  },
];

export const MANNEQUIN_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/Xbot.glb';
