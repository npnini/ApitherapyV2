import { StingPoint } from '../types/apipuncture';

// How far a point's corpo X coordinate must be from 0 before it's considered
// off the vertical midline. Calibrated from the natural gap in the sorted
// |X| distribution of the full point set (CV/GV midline points all sit
// under ~0.05; the next real value starts around 0.28), not picked arbitrarily.
const EPS_CORPO = 0.15;

export type GeometricSide = 'Left' | 'Right' | 'Midline';
export type ExpectedPairing = 'Paired' | 'Midline' | 'Mixed/Composite' | 'Right-only (unilateral)' | 'Unknown';

// World +X renders as the character's own Left: +Z is the model's front
// (established separately), and with a standard Three.js right-handed
// camera looking down -Z, world +X appears screen-right - which is the
// viewer's right but the *character's* left, since the character faces the viewer.
function classifySide(x: number, epsilon: number): GeometricSide {
  if (Math.abs(x) <= epsilon) return 'Midline';
  return x > 0 ? 'Left' : 'Right';
}

// Standard 12 primary meridians are bilateral (Paired); CV/GV (Conception/
// Governing Vessel, aka Ren/Du) run along the midline.
const PREFIX_PAIRING: Record<string, ExpectedPairing> = {
  LU: 'Paired', LI: 'Paired', ST: 'Paired', SP: 'Paired', HT: 'Paired', SI: 'Paired',
  BL: 'Paired', KI: 'Paired', KID: 'Paired', PC: 'Paired', SJ: 'Paired', TW: 'Paired',
  GB: 'Paired', LIV: 'Paired', LV: 'Paired',
  CV: 'Midline', GV: 'Midline', DU: 'Midline',
};

// Extra points / non-standard codes that don't follow the prefix table above,
// each individually verified against published TCM point references.
const CODE_OVERRIDES: Record<string, { pairing: ExpectedPairing; note: string }> = {
  'HN1': { pairing: 'Mixed/Composite', note: 'Sishencong (EX-HN1) is conventionally a 4-point set: 2 midline (anterior/posterior to GV20) + 2 paired (left/right). Only one entry exists in this DB; its geometric classification indicates which sub-point this represents.' },
  'HN3': { pairing: 'Midline', note: 'Yintang (EX-HN3), confirmed midline (between the eyebrows).' },
  'HN14': { pairing: 'Paired', note: 'Anmian (EX-HN, per label), confirmed bilateral (near GB20/TB17).' },
  'HN15': { pairing: 'Paired', note: 'Bailao (EX-HN15), confirmed bilateral (1 cun lateral to midline, each side).' },
  'NH5': { pairing: 'Paired', note: 'Label is Taiyang (EX-HN5) - code "NH5" looks like a transposed typo of "HN5". Confirmed bilateral (temple, each side).' },
  'CA1': { pairing: 'Paired', note: 'Zigong (EX-CA1), confirmed bilateral (3 cun lateral to CV3, each side).' },
  'GV4 (TW4)': { pairing: 'Midline', note: 'Label is Mingmen = GV4, a midline lower-back point. The "(TW4)" parenthetical appears to be an erroneous annotation - TW4 (Yangchi) is an unrelated paired wrist point on a different meridian.' },
  'KID9': { pairing: 'Paired', note: 'Non-standard prefix "KID" (should be "KI") for Kidney meridian, point 9 (Zhubin). Paired.' },
  'LV3': { pairing: 'Paired', note: 'Non-standard prefix "LV" (this DB uses "LIV" for other Liver points) for Liver meridian, point 3 (Taichong). Paired.' },
  'DU24/GV24': { pairing: 'Midline', note: 'Dual-named (Du Mai / Governing Vessel are the same meridian, different romanization) - Shenting, midline.' },
  'SJ12/TW12': { pairing: 'Paired', note: 'Dual-named (San Jiao / Triple Warmer are the same meridian) - Xiaoluo, paired.' },
  'TW19 (SJ19)': { pairing: 'Paired', note: 'Dual-named (Triple Warmer / San Jiao are the same meridian) - Luxi, paired.' },
  'LE6': { pairing: 'Right-only (unilateral)', note: 'Dannangxue (EX-LE6) is a diagnostic gallbladder point classically defined on the RIGHT leg only (gallbladder is a right-sided organ) - not bilateral, not midline.' },
};

function getPrefix(code: string): string {
  const m = code.match(/^([A-Za-z]+)/);
  return m ? m[1] : code;
}

function expectedPairing(code: string): { pairing: ExpectedPairing; note: string } {
  if (CODE_OVERRIDES[code]) return CODE_OVERRIDES[code];
  const prefix = getPrefix(code);
  const pairing = PREFIX_PAIRING[prefix];
  if (pairing) return { pairing, note: '' };
  return { pairing: 'Unknown', note: `Prefix "${prefix}" not recognized as a standard meridian abbreviation - needs manual review.` };
}

export interface PointAnalysisRow {
  id: string;
  code: string;
  label: string;
  meridianPrefix: string;
  corpoX: number;
  corpoY: number;
  corpoZ: number;
  corpoSide: GeometricSide;
  expectedPairing: ExpectedPairing;
  consistencyFlag: string; // 'OK' or one or more issues joined by ' | '
  referenceNote: string;
}

export interface PointAnalysisSummary {
  totalPoints: number;
  pointsWithoutCorpoPosition: number;
  flaggedCount: number;
  byExpectedPairing: Record<string, { Left: number; Right: number; Midline: number }>;
}

export interface PointAnalysisResult {
  rows: PointAnalysisRow[];
  summary: PointAnalysisSummary;
}

export function analyzePoints(points: StingPoint[]): PointAnalysisResult {
  const rows: PointAnalysisRow[] = [];
  const byExpectedPairing: PointAnalysisSummary['byExpectedPairing'] = {};
  let flaggedCount = 0;
  let pointsWithoutCorpoPosition = 0;

  for (const p of points) {
    const corpo = p.positions?.corpo;
    if (!corpo) {
      pointsWithoutCorpoPosition++;
      continue;
    }

    const label = p.label?.en || p.label?.he || '';
    const prefix = getPrefix(p.code);
    const corpoSide = classifySide(corpo.x, EPS_CORPO);
    const { pairing: expected, note } = expectedPairing(p.code);

    const flags: string[] = [];
    if (expected === 'Paired' && corpoSide === 'Midline') flags.push('expected Paired but geometrically Midline');
    if (expected === 'Midline' && corpoSide !== 'Midline') flags.push(`expected Midline but geometrically ${corpoSide}`);
    if (expected === 'Right-only (unilateral)' && corpoSide !== 'Right') flags.push(`expected Right-only but geometrically ${corpoSide}`);
    if (expected === 'Unknown') flags.push('unrecognized code/prefix');
    if (flags.length) flaggedCount++;

    rows.push({
      id: p.id,
      code: p.code,
      label,
      meridianPrefix: prefix,
      corpoX: corpo.x,
      corpoY: corpo.y,
      corpoZ: corpo.z,
      corpoSide,
      expectedPairing: expected,
      consistencyFlag: flags.length ? flags.join(' | ') : 'OK',
      referenceNote: note,
    });

    byExpectedPairing[expected] = byExpectedPairing[expected] || { Left: 0, Right: 0, Midline: 0 };
    byExpectedPairing[expected][corpoSide]++;
  }

  return {
    rows,
    summary: {
      totalPoints: points.length,
      pointsWithoutCorpoPosition,
      flaggedCount,
      byExpectedPairing,
    },
  };
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const CSV_HEADER = [
  'id', 'code', 'label', 'meridian_prefix',
  'corpo_x', 'corpo_y', 'corpo_z', 'corpo_side',
  'expected_pairing', 'consistency_flag', 'reference_note',
];

export function buildAnalysisCsv(rows: PointAnalysisRow[]): string {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push([
      r.id, r.code, r.label, r.meridianPrefix,
      r.corpoX.toFixed(4), r.corpoY.toFixed(4), r.corpoZ.toFixed(4), r.corpoSide,
      r.expectedPairing, r.consistencyFlag, r.referenceNote,
    ]);
  }
  // Leading BOM so Excel opens the file as UTF-8 instead of mangling Hebrew text.
  return '﻿' + lines.map((line) => line.map(csvEscape).join(',')).join('\n');
}
