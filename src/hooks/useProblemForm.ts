import { useState, useEffect, useCallback } from 'react';
import { doc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { Problem } from '../types/problem';
import { uploadFile, deleteFile } from '../services/storageService';

export const useProblemForm = (initialData?: Problem | null, onFormSubmit?: () => void) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getUrl = (val: string | { [key: string]: string } | undefined): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return Object.values(val)[0] || '';
  };

  const handleSubmit = useCallback(async (formData: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File | null) => {
    setIsSubmitting(true);
    try {
      let fileUrl = formData.documentUrl;

      if (file) {
        if (initialData?.documentUrl) {
          const urlToDelete = getUrl(initialData.documentUrl);
          if (urlToDelete) await deleteFile(urlToDelete);
        }
        fileUrl = await uploadFile(file, 'problem-documents');
      } else if (initialData?.documentUrl && !formData.documentUrl) {
        // This case handles when the document is deleted but no new file is uploaded
        const urlToDelete = getUrl(initialData.documentUrl);
        if (urlToDelete) await deleteFile(urlToDelete);
        fileUrl = ''; // Explicitly clear the URL
      }

      const problemData = { ...formData, documentUrl: fileUrl };

      if (initialData) {
        const problemRef = doc(db, 'cfg_problems', initialData.id);
        await updateDoc(problemRef, problemData);
      } else {
        await addDoc(collection(db, 'cfg_problems'), problemData);
      }

      onFormSubmit?.();
    } catch (error) {
      console.error("Error saving problem: ", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [initialData, onFormSubmit]);

  const handleDelete = useCallback(async () => {
    if (initialData) {
      setIsDeleting(true);
      try {
        if (initialData.documentUrl) {
          const urlToDelete = getUrl(initialData.documentUrl);
          if (urlToDelete) await deleteFile(urlToDelete);
        }
        const problemRef = doc(db, 'cfg_problems', initialData.id);
        await updateDoc(problemRef, { documentUrl: '' });
      } catch (error) {
        console.error("Error deleting document from problem: ", error);
      } finally {
        setIsDeleting(false);
      }
    }
  }, [initialData]);

  return { isSubmitting, isDeleting, handleSubmit, handleDelete };
};
