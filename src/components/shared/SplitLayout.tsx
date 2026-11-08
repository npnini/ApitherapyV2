import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './SplitLayout.module.css';

interface SplitLayoutProps {
    /** First pane (left in LTR, right in RTL). */
    start: React.ReactNode;
    /** Second pane. */
    end: React.ReactNode;
    /** localStorage key under which the divider position is remembered. */
    storageKey: string;
    /** Width of the first pane, percent. */
    defaultRatio?: number;
    minRatio?: number;
    maxRatio?: number;
    /** Accessible names of the two panes. */
    startLabel?: string;
    endLabel?: string;
}

const readRatio = (key: string, fallback: number, min: number, max: number): number => {
    try {
        const stored = Number(window.localStorage.getItem(key));
        if (Number.isFinite(stored) && stored >= min && stored <= max) return stored;
    } catch {
        // storage can be blocked; use the default
    }
    return fallback;
};

/**
 * Two panes side by side, each scrolling independently, with a draggable divider.
 * Each pane is a CSS container named "splitpane": screens inside can adapt to the PANE width
 * with `@container splitpane (max-width: …)` instead of the viewport width.
 * Mirrors automatically in right-to-left languages (grid follows the page direction).
 */
const SplitLayout: React.FC<SplitLayoutProps> = ({
    start, end, storageKey, defaultRatio = 50, minRatio = 30, maxRatio = 70, startLabel, endLabel,
}) => {
    const [ratio, setRatio] = useState<number>(() => readRatio(storageKey, defaultRatio, minRatio, maxRatio));
    const rootRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);

    const clamp = useCallback((value: number) => Math.min(maxRatio, Math.max(minRatio, value)), [minRatio, maxRatio]);

    const saveRatio = useCallback((value: number) => {
        try {
            window.localStorage.setItem(storageKey, String(Math.round(value)));
        } catch {
            // not remembered; fine
        }
    }, [storageKey]);

    const updateFromPointer = useCallback((clientX: number) => {
        const root = rootRef.current;
        if (!root) return;
        const rect = root.getBoundingClientRect();
        if (rect.width <= 0) return;
        const isRtl = getComputedStyle(root).direction === 'rtl';
        const fromStart = isRtl ? rect.right - clientX : clientX - rect.left;
        setRatio(clamp((fromStart / rect.width) * 100));
    }, [clamp]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (draggingRef.current) updateFromPointer(e.clientX);
    };
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        saveRatio(ratio);
    };

    // Keyboard: arrows move the divider by 5%, Home/End reset to the default.
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const isRtl = rootRef.current ? getComputedStyle(rootRef.current).direction === 'rtl' : false;
        let next: number | null = null;
        if (e.key === 'ArrowLeft') next = ratio + (isRtl ? 5 : -5);
        else if (e.key === 'ArrowRight') next = ratio + (isRtl ? -5 : 5);
        else if (e.key === 'Home' || e.key === 'End') next = defaultRatio;
        if (next === null) return;
        e.preventDefault();
        const clamped = clamp(next);
        setRatio(clamped);
        saveRatio(clamped);
    };

    // Safety: never leave the drag flag set if the pointer is released outside the window.
    useEffect(() => {
        const stop = () => { draggingRef.current = false; };
        window.addEventListener('blur', stop);
        return () => window.removeEventListener('blur', stop);
    }, []);

    return (
        <div
            ref={rootRef}
            className={styles.root}
            style={{ gridTemplateColumns: `${ratio}fr 0.5rem ${100 - ratio}fr` }}
        >
            <section className={styles.pane} aria-label={startLabel}>{start}</section>
            <div
                className={styles.divider}
                role="separator"
                aria-orientation="vertical"
                aria-valuemin={minRatio}
                aria-valuemax={maxRatio}
                aria-valuenow={Math.round(ratio)}
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={onKeyDown}
            />
            <section className={styles.pane} aria-label={endLabel}>{end}</section>
        </div>
    );
};

export default SplitLayout;
