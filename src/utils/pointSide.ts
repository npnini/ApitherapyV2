export type PointSide = 'L' | 'R';

/** Localized side label: 'L'/'R' in LTR, 'ש'/'י' in RTL (ש = שמאל/Left, י = ימין/Right) */
export const getSideLabel = (side: PointSide | undefined, direction: 'ltr' | 'rtl'): string => {
    if (!side) return '';
    if (direction === 'rtl') return side === 'R' ? 'י' : 'ש';
    return side;
};

/** Formats a point code with its side suffix, e.g. "BL23-R" / "BL23-ש", or just the code if no side is set */
export const formatPointCode = (code: string, side: PointSide | undefined, direction: 'ltr' | 'rtl'): string => {
    const label = getSideLabel(side, direction);
    return label ? `${code}-${label}` : code;
};
