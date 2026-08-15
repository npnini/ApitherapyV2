export interface StungPointCounts {
    left: number;
    right: number;
    single: number;
}

/** Formats a point code with its R/L/S suffix built from nonzero counters, e.g. "BL23-RL", "CV4-S", or just the code if all counters are 0 */
export const formatPointCode = (code: string, counts: StungPointCounts | undefined): string => {
    if (!counts) return code;
    let suffix = '';
    if (counts.right > 0) suffix += 'R';
    if (counts.left > 0) suffix += 'L';
    if (counts.single > 0) suffix += 'S';
    return suffix ? `${code}-${suffix}` : code;
};
