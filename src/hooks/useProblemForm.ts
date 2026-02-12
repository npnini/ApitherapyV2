import { useState, useEffect, useCallback } from 'react';
import { doc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { Problem } from '../types/problem';
import { uploadFile, deleteFile } from '../services/storageService';

export const useProblemForm = (initialData?: Problem | null, onFormSubmit?: () => void) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSubmit = useCallback(async (formData: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File | null) => {
    setIsSubmitting(true);
    try {
      let fileUrl = formData.documentUrl;

      if (file) {
        if (initialData?.documentUrl) {
          await deleteFile(initialData.documentUrl);
        }
        fileUrl = await uploadFile(file, 'problem-documents');
      } else if (initialData?.documentUrl && !formData.documentUrl) {
        // This case handles when the document is deleted but no new file is uploaded
        await deleteFile(initialData.documentUrl);
        fileUrl = ''; // Explicitly clear the URL
      }

      const problemData = { ...formData, documentUrl: fileUrl };

      if (initialData) {
        const problemRef = doc(db, 'problems', initialData.id);
        await updateDoc(problemRef, problemData);
      } else {
        await addDoc(collection(db, 'problems'), problemData);
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
          await deleteFile(initialData.documentUrl);
        }
        const problemRef = doc(db, 'problems', initialData.id);
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
