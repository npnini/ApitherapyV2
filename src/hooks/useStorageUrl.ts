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
export function useStorageUrl(
  input: string | Record<string, string> | undefined,
  lang: string = 'en',
  type: 'image' | 'doc' = 'image'
) {
  const [url, setUrl]       = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | undefined>(undefined);

  useEffect(() => {
    const content = getFieldContent(input, lang);
    if (!content) {
      setUrl(undefined);
      setError(undefined);
      return;
    }

    // ── External / Google Drive URL ──────────────────────────────────────────
    if (content.startsWith('http')) {
      setUrl(transformGDriveLink(content, type));
      setError(undefined);
      return;
    }

    // ── Firebase Storage path ────────────────────────────────────────────────
    // Use getBytes() so we can create a blob: URL that:
    //   • is served from the same origin → no CORS headers needed
    //   • has no Content-Disposition: attachment → iframes display inline
    let blobUrl: string | undefined;
    let cancelled = false;

    setLoading(true);
    setError(undefined);

    const storageRef = ref(storage, content);

    getBytes(storageRef)
      .then(bytes => {
        if (cancelled) return;
        const mime = mimeFromPath(content, type);
        const blob = new Blob([bytes], { type: mime });
        blobUrl = URL.createObjectURL(blob);
        setUrl(blobUrl);
        setLoading(false);
      })
      .catch(bytesErr => {
        if (cancelled) return;
        console.warn('useStorageUrl: getBytes() failed, falling back to getDownloadURL', bytesErr);
        // Fallback: getDownloadURL works for images (CORS is usually fine) but
        // may still fail for documents inside iframes. Best-effort.
        getDownloadURL(storageRef)
          .then(dlUrl => {
            if (cancelled) return;
            setUrl(transformGDriveLink(dlUrl, type));
            setLoading(false);
          })
          .catch(dlErr => {
            if (cancelled) return;
            console.error('useStorageUrl: getDownloadURL() also failed', dlErr);
            setUrl(undefined);
            setError(dlErr?.message ?? 'Failed to load file');
            setLoading(false);
          });
      });

    // Cleanup: cancel the async and revoke the blob URL to free memory
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [input, lang, type]);

  return { url, loading, error };
}
