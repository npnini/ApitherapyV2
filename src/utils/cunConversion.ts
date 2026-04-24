/**
 * CUN (寸) is a traditional Chinese anatomical unit of measurement.
 * 1 CUN = width of the middle finger ≈ 2 cm for an adult.
 *
 * For the Corpo model, coordinates are stored in 'normalized' space
 * (e.point / derivedScale). In this space, the model's total height is roughly
 * 180 units, meaning 1 normalized unit ≈ 1 cm.
 * 
 * Therefore:
 * 1 CUN (2 cm) ≈ 2 normalized units.
 */
export const CUN_TO_MODEL_UNIT = 2.0;

/** Convert a distance in CUN to normalized model units. */
export const cunToModelUnits = (cun: number): number => cun * CUN_TO_MODEL_UNIT;

