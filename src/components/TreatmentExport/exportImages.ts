import { ref, getBytes } from 'firebase/storage';
import { storage } from '../../firebase';

/** Longest side of an exported photo, in pixels. Keeps the print job and memory small. */
const MAX_SIDE = 1200;
const JPEG_QUALITY = 0.8;
const CONCURRENCY = 4;

/** Loads one Storage photo, scales it down and returns a blob URL (JPEG), or null on any failure. */
async function loadScaledImage(path: string): Promise<string | null> {
    try {
        let blob: Blob;
        if (path.startsWith('http')) {
            const res = await fetch(path);
            if (!res.ok) return null;
            blob = await res.blob();
        } else {
            const bytes = await getBytes(ref(storage, path));
            blob = new Blob([bytes]);
        }

        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            return null;
        }
        // JPEG has no transparency: paint white first so transparent PNGs do not turn black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const scaled = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
        return scaled ? URL.createObjectURL(scaled) : null;
    } catch (err) {
        console.warn('Treatment export: could not load image', path, err);
        return null;
    }
}

export interface PreparedImages {
    /** Storage path -> blob URL. A path is missing from the map when its image could not be loaded. */
    urls: Map<string, string>;
    /** Number of images that failed to load. */
    failed: number;
}

/** Loads all images (a few at a time). Never throws; failures are counted. */
export async function prepareExportImages(paths: string[]): Promise<PreparedImages> {
    const unique = Array.from(new Set(paths.filter(Boolean)));
    const urls = new Map<string, string>();
    let failed = 0;
    let next = 0;

    const worker = async () => {
        while (next < unique.length) {
            const path = unique[next++];
            const url = await loadScaledImage(path);
            if (url) urls.set(path, url);
            else failed++;
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
    return { urls, failed };
}

/** Resolves when every image has decoded (or failed), so printing never shows blanks. */
export async function waitForImages(urls: Iterable<string>): Promise<void> {
    await Promise.all(Array.from(urls).map(url => {
        const img = new Image();
        img.src = url;
        return img.decode().catch(() => undefined);
    }));
}

export function revokeExportImages(urls: Map<string, string>): void {
    urls.forEach(url => URL.revokeObjectURL(url));
}
