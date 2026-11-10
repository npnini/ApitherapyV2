import { useEffect, useState } from 'react';

/** True while the media query matches (e.g. '(pointer: coarse)' for a touch screen). */
export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState<boolean>(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        onChange();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return matches;
};
