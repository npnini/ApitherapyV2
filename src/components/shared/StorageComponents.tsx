import React from 'react';
import { useStorageUrl } from '../../hooks/useStorageUrl';

interface StorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  path: string | Record<string, string> | undefined;
  lang?: string;
  fallback?: React.ReactNode;
}

export const StorageImage: React.FC<StorageImageProps> = ({ path, lang, fallback, ...props }) => {
  const { url, loading } = useStorageUrl(path, lang, 'image');

  if (loading) return <>{fallback || <span>Loading...</span>}</>;
  if (!url) return null;

  return <img src={url} {...props} />;
};

interface StorageLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  path: string | Record<string, string> | undefined;
  lang?: string;
  label?: React.ReactNode;
}

export const StorageLink: React.FC<StorageLinkProps> = ({ path, lang, label, ...props }) => {
  const { url } = useStorageUrl(path, lang, 'doc');

  if (!url) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
      {label || props.children}
    </a>
  );
};
