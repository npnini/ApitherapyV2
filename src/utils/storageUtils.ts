import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

/**
 * Resolves a storage path or a full URL to a download URL.
 * If the input is already a full URL (legacy), it returns it as-is.
 * If the input is a path, it fetches the download URL from Firebase Storage.
 */
export async function resolveStoragePath(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  
  // If it's already a full URL, return it
  if (path.startsWith('http')) return path;
  
  try {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
  } catch (error) {
    return undefined;
  }
}

/**
 * Extracts a Google Drive file ID from various link formats.
 */
function extractGDriveId(url: string): string | null {
  const match = url.match(/\/file\/d\/([^\/?#]+)/) || url.match(/[?&]id=([^&?#]+)/);
  return match?.[1] ?? null;
}

/**
 * Transforms a Google Drive link into a direct image or preview link.
 *
 * For images: uses `uc?export=view` which respects the user's Google
 * session cookies — works for files shared at the org level, not just
 * "Anyone with the link".
 *
 * For docs: uses the `/preview` iframe format.
 */
export function transformGDriveLink(url: string | undefined, type: 'image' | 'doc' = 'image'): string | undefined {
  if (!url) return undefined;
  if (!url.includes('drive.google.com')) return url;

  const id = extractGDriveId(url);
  if (!id) return url;

  if (type === 'image') {
    // uc?export=view sends the raw file with session-based auth
    return `https://drive.google.com/uc?export=view&id=${id}`;
  } else {
    // preview format for iframes/docs
    return `https://drive.google.com/file/d/${id}/preview`;
  }
}

/**
 * Returns an ordered list of fallback image URLs to try if the primary one fails.
 * Used by <img onError> to cycle through alternative Google Drive URL formats.
 */
export function getGDriveFallbackUrls(url: string | undefined): string[] {
  if (!url) return [];
  if (!url.includes('drive.google.com')) return [];

  const id = extractGDriveId(url);
  if (!id) return [];

  return [
    // 1. High-res thumbnail (works for publicly-shared files)
    `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
    // 2. Lh3 content host (works for some Google-internal files)
    `https://lh3.googleusercontent.com/d/${id}`,
  ];
}

/**
 * Extracts the appropriate path/URL from a multilingual field.
 */
export function getFieldContent(input: string | Record<string, string> | undefined, lang: string): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') return input;
  return input[lang] || input.en || Object.values(input)[0];
}
