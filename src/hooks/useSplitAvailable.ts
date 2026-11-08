import { useEffect, useState } from 'react';

/** Two panes side by side need at least this viewport width (each pane gets about 600px). */
export const SPLIT_MIN_VIEWPORT_WIDTH = 1280;

/**
 * True while the viewport is wide enough to show two panes side by side
 * (laptop and wide screens). False on tablets and phones.
 */
export const useSplitAvailable = (minWidth: number = SPLIT_MIN_VIEWPORT_WIDTH): boolean => {
    const query = `(min-width: ${minWidth}px)`;
    const [available, setAvailable] = useState<boolean>(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(query);
        const onChange = () => setAvailable(mql.matches);
        onChange();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return available;
};
