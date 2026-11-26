import { createContext, useContext } from 'react';

/**
 * The place in the treatment stepper bar where a treatment screen puts its own title and Back button
 * (laptop and wider screens). Null on phones: the screen then shows its header itself, as before.
 */
export const StepHeaderSlotContext = createContext<HTMLElement | null>(null);

export const useStepHeaderSlot = (): HTMLElement | null => useContext(StepHeaderSlotContext);
