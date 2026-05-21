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
import { db, auth, functions } from '../firebase'; // ← VERIFY: adjust this path to match your project's firebase init file
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const STATIC_FALLBACKS: Record<string, Record<string, string>> = {
    he: {
        "Welcome please signin": "ברוכים הבאים, אנא התחברו",
        "Login with Google": "התחבר באמצעות Google",
        "Initializing...": "מאתחל...",
        "Loading Patient Data...": "טוען נתוני מטופל..."
    }
};


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

    // Strings that failed to translate (to prevent infinite retry loops)
    const failedRef = useRef<Set<string>>(new Set());

    // Flag to prevent concurrent translation batches
    const isProcessingRef = useRef(false);

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
        if (failedRef.current.has(`${language}:${text}`)) return; // already failed this session

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
        return cacheRef.current[language]?.[text] ?? STATIC_FALLBACKS[language]?.[text] ?? text;
    }, [language]);

    // After each render cycle, flush pending strings to the translation API
    useEffect(() => {
        if (language === 'en') return;

        const pending = Array.from(pendingRef.current);

        // Batch processing logic
        if (pending.length === 0 && cacheRef.current[language]) return;
        if (isProcessingRef.current) return;

        isProcessingRef.current = true;
        pendingRef.current = new Set();

        // Mark strings as "tried" immediately to prevent re-registration during the async call
        pending.forEach(s => failedRef.current.add(`${language}:${s}`));

        translateBatch(pending, language, cacheRef.current).then((failedStrings) => {
            // If they actually succeeded, they will be in cacheRef.current[language]
            // and registerString will skip them anyway. 
            // If they failed, they are already in failedRef.
            isProcessingRef.current = false;
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
//   2. For strings not in Firestore, call translateText Cloud Function
//   3. Store results back to Firestore so future users get them for free

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
): Promise<string[]> {
    if (!cache[targetLang]) cache[targetLang] = {};

    const firestoreDocId = `ui_${targetLang}`;
    const firestoreRef = doc(db, 'cfg_translations', firestoreDocId);

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
    console.log(`[T] Batch processing for ${targetLang}. Total requested: ${strings.length}, To translate via Proxy: ${toTranslate.length}`);
    if (toTranslate.length === 0) return [];

    // ── Step 3: Call translation proxy Cloud Function ────────────────────────
    try {
        const translateTextCall = httpsCallable(functions, 'translateText');
        const result = await translateTextCall({
            q: toTranslate,
            target: targetLang,
            source: 'en'
        });

        // The Cloud Function returns { data: { data: { translations: [...] } } }
        const resData = (result.data as any).data;
        console.log(`[T] Proxy Translation data received for ${targetLang}:`, resData);
        
        const newTranslations: Record<string, string> = {};

        resData.data.translations.forEach((item: { translatedText: string }, index: number) => {
            const original = toTranslate[index];
            let translated = item.translatedText;

            // Clean Hebrew vowels if target language is Hebrew
            if (targetLang === 'he') {
                translated = stripHebrewNiqqud(translated);
            }

            console.log(`[T] Proxy Result: "${original}" -> "${translated}"`);
            cache[targetLang][original] = translated;
            newTranslations[original] = translated;
        });

        // ── Step 4: Persist new translations back to Firestore ───────────────
        if (auth.currentUser) {
            try {
                await setDoc(firestoreRef, { ...firestoreCache, ...newTranslations }, { merge: true });
            } catch (e) {
                console.warn('[T] Firestore cache write failed (translations still work this session):', e);
            }
        } else {
            console.log('[T] Skipping Firestore cache update: user not authenticated.');
        }

        return []; // Success, no failed strings

    } catch (e) {
        console.error('[T] Translation proxy call failed:', e);
        return toTranslate; // Return the strings that failed
    }
}
