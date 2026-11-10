import { useCallback, useEffect, useState } from 'react';

/**
 * Width of an element, kept up to date with ResizeObserver.
 * Use the returned callback as the element's `ref`; it also works when the element
 * appears later (after a loading state). Width is 0 until the element is measured.
 */
export const useElementWidth = (): [(element: HTMLElement | null) => void, number] => {
    const [element, setElement] = useState<HTMLElement | null>(null);
    const [width, setWidth] = useState(0);
    const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

    useEffect(() => {
        if (!element) return;
        setWidth(element.getBoundingClientRect().width);
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) setWidth(entry.contentRect.width);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);

    return [ref, width];
};
