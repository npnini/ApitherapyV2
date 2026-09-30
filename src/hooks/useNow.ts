import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs`. Lets a view that depends on "now" (the Today
 * page's now-line and states, the sidebar's "still to come" badge) update on its own, without
 * re-rendering the whole app.
 */
export const useNow = (intervalMs: number = 30_000): Date => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
};
