import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadFile, deleteFile } from './storageService';

/**
 * Documents of configuration items (points, and later protocols, problems and measures).
 *
 * Storage layout: <Type>/<itemId>/<lang>/<timestamp>_<file name>, e.g.
 * Points/4bwJMuXodZwni7UD4h9C/he/1777474416931_KID10 Yingu.pdf.
 * The item's `documentUrl` map (language -> that path) is the source of truth; the bucket mirrors it.
 *
 * Save order (an item never refers to a missing file): upload the new files -> write the item ->
 * delete the files the item no longer uses.
 * See docs/Future/Entity-Documents-Cleanup-Plan.md (D2, D6).
 */

export type DocumentFolderType = 'Points';

/** Language keys are used inside Storage paths: lower-case letters only (he, en, ar, ru...). */
const LANG_PATTERN = /^[a-z]{2,3}$/;

/** Storage folder of one document: <Type>/<itemId>/<lang>. */
export function documentFolder(type: DocumentFolderType, itemId: string, lang: string): string {
    if (!itemId) throw new Error('A document folder needs the item id.');
    if (!LANG_PATTERN.test(lang)) throw new Error(`Invalid document language: ${lang}`);
    return `${type}/${itemId}/${lang}`;
}

/** A new Firestore id for an item that is not saved yet, so its files can go to their own folder. Writes nothing. */
export function newDocumentId(collectionName: string): string {
    return doc(collection(db, collectionName)).id;
}

/**
 * Uploads the files chosen in a form (language -> file) to <Type>/<itemId>/<lang>/.
 * Returns language -> storage path. If one upload fails, the files already uploaded by this call
 * are deleted and the error is thrown, so nothing is left behind.
 */
export async function uploadPendingDocuments(
    type: DocumentFolderType,
    itemId: string,
    files: Record<string, File>
): Promise<Record<string, string>> {
    const uploaded = new Map<string, string>();
    try {
        for (const [lang, file] of Object.entries(files)) {
            if (!file) continue;
            uploaded.set(lang, await uploadFile(file, documentFolder(type, itemId, lang)));
        }
    } catch (error) {
        await deleteDocuments(Array.from(uploaded.values()));
        throw error;
    }
    return Object.fromEntries(uploaded);
}

/** Deletes files from Storage. Never throws: a file that cannot be deleted is only an unused file. */
export async function deleteDocuments(paths: string[]): Promise<void> {
    for (const path of paths) {
        if (!path) continue;
        try {
            await deleteFile(path);
        } catch (error) {
            console.error('Could not delete document file (left in Storage):', path, error);
        }
    }
}

/** Paths used by `before` that `after` no longer uses: files that were replaced or removed. */
export function unusedDocumentPaths(
    before: Record<string, string> | string | null | undefined,
    after: Record<string, string> | null | undefined
): string[] {
    // An old single-string value has no language; the admin screens have always read it as English.
    const beforeMap: Record<string, string> = typeof before === 'string' ? { en: before } : (before || {});
    const stillUsed = new Set(Object.values(after || {}));
    return Object.values(beforeMap).filter(path => !!path && !stillUsed.has(path));
}
