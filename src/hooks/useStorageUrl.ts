import { useState, useEffect } from 'react';
import { resolveStoragePath, getFieldContent, transformGDriveLink } from '../utils/storageUtils';

export function useStorageUrl(
  input: string | Record<string, string> | undefined, 
  lang: string = 'en',
  type: 'image' | 'doc' = 'image'
) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const content = getFieldContent(input, lang);
    if (!content) {
      setUrl(undefined);
      return;
    }

    if (content.startsWith('http')) {
      setUrl(transformGDriveLink(content, type));
      return;
    }

    setLoading(true);
    resolveStoragePath(content).then(resolvedUrl => {
      setUrl(transformGDriveLink(resolvedUrl, type));
      setLoading(false);
    });
  }, [input, lang, type]);

  return { url, loading };
}
