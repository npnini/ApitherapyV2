/**
 * T.tsx — Drop-in translation component and hook
 *
 * Place this file at: src/components/T.tsx
 *
 * Usage in JSX:
 *   <T>Welcome to the app</T>
 *
 * Usage in JS string context (props, error messages, etc.):
 *   placeholder={useT('Enter patient name')}
 *   setError(useT('Failed to save'))
 *
 * Translations are cached in Firestore under:
 *   translations/{language}  →  { "English string": "Translated string", ... }
 *
 * On first visit to a page in a new language, all strings for that page
 * are collected and sent in a single batched API call, then stored in
 * Firestore so every subsequent user worldwide gets the cached version.
 */

import React, { useState, useEffect, useContext, createContext, useCallback, useRef } from 'react';
import { db } from '../firebase'; // ← VERIFY: adjust this path to match your project's firebase init file
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranslationContextValue {
    language: string;
    direction: 'ltr' | 'rtl';
    setLanguage: (lang: string) => void;
    registerString: (text: string) => void;
    getTranslation: (text: string) => string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TranslationContext = createContext<TranslationContextValue>({
    language: 'en',
    direction: 'ltr',
    setLanguage: () => { },
    registerString: () => { },
    getTranslation: (text) => text,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<string>(() => {
        return localStorage.getItem('appLanguage') || 'en';
    });

    // Cache: language → { englishText: translatedText }
    const cacheRef = useRef<Record<string, Record<string, string>>>({});

    // Pending strings waiting to be translated this render cycle
    const pendingRef = useRef<Set<string>>(new Set());

    // Timeout for batching forceUpdates
    const flushTimeoutRef = useRef<any>(null);

    // Trigger re-render after translations arrive
    const [, forceUpdate] = useState(0);

    const setLanguage = useCallback((lang: string) => {
        localStorage.setItem('appLanguage', lang);
        setLanguageState(lang);
    }, []);

    // Called by every <T> and useT() on render to register their string
    const registerString = useCallback((text: string) => {
        if (language === 'en') return;
        if (cacheRef.current[language]?.[text]) return; // already cached
        if (pendingRef.current.has(text)) return; // already in queue

        pendingRef.current.add(text);

        // Schedule a flush if not already scheduled
        if (!flushTimeoutRef.current) {
            flushTimeoutRef.current = setTimeout(() => {
                forceUpdate(n => n + 1);
                flushTimeoutRef.current = null;
            }, 50); // Small delay to batch all strings from a new view
        }
    }, [language]);

    // Returns the translated string if available, otherwise the original English
    const getTranslation = useCallback((text: string): string => {
        if (language === 'en') return text;
        return cacheRef.current[language]?.[text] ?? text;
    }, [language]);

    // After each render cycle, flush pending strings to the translation API
    useEffect(() => {
        if (language === 'en') return;

        const pending = Array.from(pendingRef.current);

        // Batch processing logic
        // We only trigger if there are pending strings OR if we haven't loaded the firestore cache for this lang yet
        if (pending.length === 0 && cacheRef.current[language]) return;

        pendingRef.current = new Set();

        translateBatch(pending, language, cacheRef.current).then(() => {
            forceUpdate(n => n + 1);
        });
    }); // Run after every render to catch newly registered strings

    const direction = language === 'he' ? 'rtl' : 'ltr';

    return (
        <TranslationContext.Provider value={{ language, direction, setLanguage, registerString, getTranslation }}>
            {children}
        </TranslationContext.Provider>
    );
};

export const useTranslationContext = () => useContext(TranslationContext);

// ─── <T> component ────────────────────────────────────────────────────────────

export const T: React.FC<{ children: string }> = ({ children }) => {
    const { registerString, getTranslation } = useContext(TranslationContext);
    registerString(children);
    return <>{getTranslation(children)}</>;
};

// ─── useT() hook — for string contexts (props, error messages, etc.) ──────────

export const useT = (text: string): string => {
    const { registerString, getTranslation } = useContext(TranslationContext);
    registerString(text);
    return getTranslation(text);
};

// ─── Batch translation logic ──────────────────────────────────────────────────
//
// Strategy:
//   1. Check Firestore cache first (shared across all users)
//   2. For strings not in Firestore, call Google Translate API
//   3. Store results back to Firestore so future users get them for free

const TRANSLATION_API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_KEY;
// ↑ VERIFY: this must match the variable name you added to .env in Step 1.2

/**
 * Removes Hebrew Niqqud (vowels) and cantillation marks from a string.
 */
export const stripHebrewNiqqud = (text: string): string => {
    if (typeof text !== 'string') return text;
    // Unicode range for Hebrew points and punctuation:
    // \u0591-\u05AF: Hebrew accents
    // \u05B0-\u05C7: Hebrew points (vowels)
    return text.replace(/[\u0591-\u05C7]/g, '');
};

async function translateBatch(
    strings: string[],
    targetLang: string,
    cache: Record<string, Record<string, string>>
): Promise<void> {
    if (!cache[targetLang]) cache[targetLang] = {};

    const firestoreDocId = `ui_${targetLang}`;
    const firestoreRef = doc(db, 'translations', firestoreDocId);

    // ── Step 1: Fetch from Firestore ─────────────────────────────────────────
    let firestoreCache: Record<string, string> = {};
    try {
        const snap = await getDoc(firestoreRef);
        if (snap.exists()) {
            firestoreCache = snap.data() as Record<string, string>;
            console.log(`[T] Firestore cache hit for ${targetLang}. Found ${Object.keys(firestoreCache).length} strings.`);
            Object.assign(cache[targetLang], firestoreCache);
        } else {
            console.log(`[T] No Firestore cache doc found for ${targetLang}.`);
        }
    } catch (e) {
        console.warn('[T] Firestore cache read failed, falling back to API:', e);
    }

    // ── Step 2: Find strings still missing after Firestore lookup ────────────
    const toTranslate = strings.filter(s => !cache[targetLang][s]);
    console.log(`[T] Batch processing for ${targetLang}. Total requested: ${strings.length}, To translate via API: ${toTranslate.length}`);
    if (toTranslate.length === 0) return;

    // ── Step 3: Call Google Translate API in one batched request ─────────────
    if (!TRANSLATION_API_KEY) {
        console.warn('[T] No VITE_GOOGLE_TRANSLATE_KEY set. Strings will display in English.');
        return;
    }

    try {
        const response = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${TRANSLATION_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    q: toTranslate,
                    target: targetLang,
                    source: 'en',
                    format: 'text',
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Translation API responded with ${response.status}`);
        }

        const data = await response.json();
        console.log(`[T] API Translation data received for ${targetLang}:`, data);
        const newTranslations: Record<string, string> = {};

        data.data.translations.forEach((item: { translatedText: string }, index: number) => {
            const original = toTranslate[index];
            let translated = item.translatedText;

            // Clean Hebrew vowels if target language is Hebrew
            if (targetLang === 'he') {
                translated = stripHebrewNiqqud(translated);
            }

            console.log(`[T] API Result: "${original}" -> "${translated}"`);
            cache[targetLang][original] = translated;
            newTranslations[original] = translated;
        });

        // ── Step 4: Persist new translations back to Firestore ───────────────
        try {
            await setDoc(firestoreRef, { ...firestoreCache, ...newTranslations }, { merge: true });
        } catch (e) {
            console.warn('[T] Firestore cache write failed (translations still work this session):', e);
        }

    } catch (e) {
        console.error('[T] Translation API call failed:', e);
    }
}
