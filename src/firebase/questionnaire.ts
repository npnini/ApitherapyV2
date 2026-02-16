import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Questionnaire } from '../types/questionnaire';

export const getQuestionnaire = async (domain: string): Promise<Questionnaire | null> => {
  const q = query(collection(db, 'questionnaires'), where('domain', '==', domain));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return null;
  }

  const doc = querySnapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Questionnaire;
};
