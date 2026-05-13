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
 * Transforms a Google Drive link into a direct image or preview link.
 */
export function transformGDriveLink(url: string | undefined, type: 'image' | 'doc' = 'image'): string | undefined {
  if (!url) return undefined;
  if (!url.includes('drive.google.com')) return url;

  // Extract ID from /file/d/ID/view or /uc?id=ID or /open?id=ID
  const match = url.match(/\/file\/d\/([^\/?#]+)/) || url.match(/[?&]id=([^&?#]+)/);
  if (match && match[1]) {
    const id = match[1];
    if (type === 'image') {
      // Use the thumbnail/direct link format for images
      return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    } else {
      // Use the preview format for iframes/docs
      return `https://drive.google.com/file/d/${id}/preview`;
    }
  }
  return url;
}

/**
 * Extracts the appropriate path/URL from a multilingual field.
 */
export function getFieldContent(input: string | Record<string, string> | undefined, lang: string): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') return input;
  return input[lang] || input.en || Object.values(input)[0];
}
