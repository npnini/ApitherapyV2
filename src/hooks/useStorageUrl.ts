import { useState, useEffect } from 'react';
import { ref, getBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { getFieldContent, transformGDriveLink } from '../utils/storageUtils';

/** Maps file extension → MIME type for blob URL creation */
const EXT_MIME: Record<string, string> = {
  pdf:  'application/pdf',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  svg:  'image/svg+xml',
  txt:  'text/plain',
  html: 'text/html',
  htm:  'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
};

function mimeFromPath(path: string, fallbackType: 'image' | 'doc'): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? (fallbackType === 'image' ? 'image/jpeg' : 'application/pdf');
}

/**
 * Resolves a storage path or full URL into a usable URL for <img> or <iframe>.
 *
 * - For Google Drive / other http URLs: transforms using transformGDriveLink (returns /preview or /thumbnail variants)
 * - For Firebase Storage paths: fetches raw bytes with getBytes() and creates a blob: URL.
 *   This avoids two common pitfalls:
 *     1. Content-Disposition: attachment → iframes try to download instead of display inline
 *     2. CORS restrictions on direct <img src> fetches against the Storage emulator
 *
 * The blob URL is automatically revoked when the component using this hook unmounts
 * or when the input changes, preventing memory leaks.
 */
/** How long a replaced blob: link stays valid, so a tab that is just opening it can still load it. */
const BLOB_REVOKE_DELAY_MS = 60_000;

export function useStorageUrl(
  input: string | Record<string, string> | undefined,
  lang: string = 'en',
  type: 'image' | 'doc' = 'image'
) {
  // The file this hook is asked for now. The effect depends on this string (not on `input`, which can
  // be a new object on every render), so the link is only rebuilt when the file really changes.
  const content = getFieldContent(input, lang);

  // The result remembers which file it was made for, so a link made for another file
  // (e.g. the previous language tab) is never handed out after the input changes.
  const [result, setResult] = useState<{ content?: string; url?: string; error?: string }>({});

  useEffect(() => {
    if (!content) {
      setResult({});
      return;
    }

    // ── External / Google Drive URL ──────────────────────────────────────────
    if (content.startsWith('http')) {
      setResult({ content, url: transformGDriveLink(content, type) });
      return;
    }

    // ── Firebase Storage path ────────────────────────────────────────────────
    // Use getBytes() so we can create a blob: URL that:
    //   • is served from the same origin → no CORS headers needed
    //   • has no Content-Disposition: attachment → iframes display inline
    let blobUrl: string | undefined;
    let cancelled = false;

    const storageRef = ref(storage, content);

    getBytes(storageRef)
      .then(bytes => {
        if (cancelled) return;
        const mime = mimeFromPath(content, type);
        const blob = new Blob([bytes], { type: mime });
        blobUrl = URL.createObjectURL(blob);
        setResult({ content, url: blobUrl });
      })
      .catch(bytesErr => {
        if (cancelled) return;
        console.warn('useStorageUrl: getBytes() failed, falling back to getDownloadURL', bytesErr);
        // Fallback: getDownloadURL works for images (CORS is usually fine) but
        // may still fail for documents inside iframes. Best-effort.
        getDownloadURL(storageRef)
          .then(dlUrl => {
            if (cancelled) return;
            setResult({ content, url: transformGDriveLink(dlUrl, type) });
          })
          .catch(dlErr => {
            if (cancelled) return;
            console.error('useStorageUrl: getDownloadURL() also failed', dlErr);
            setResult({ content, error: dlErr?.message ?? 'Failed to load file' });
          });
      });

    // Cleanup: cancel the async and release the blob URL to free memory (after a delay: a new tab
    // opened from the link a moment ago may still be loading it)
    return () => {
      cancelled = true;
      if (blobUrl) {
        const toRelease = blobUrl;
        setTimeout(() => URL.revokeObjectURL(toRelease), BLOB_REVOKE_DELAY_MS);
      }
    };
  }, [content, type]);

  const current = content && result.content === content ? result : undefined;
  return {
    url: current?.url,
    // true from the first render until this file's link is ready (or failed)
    loading: !!content && !current,
    error: current?.error,
  };
}
