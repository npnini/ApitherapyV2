import { doc, setDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Questionnaire } from '../types/questionnaire';

export const saveQuestionnaire = async (questionnaire: Partial<Questionnaire>): Promise<string> => {
    let questionnaireRef;
    if (questionnaire.id) {
        questionnaireRef = doc(db, 'questionnaires', questionnaire.id);
    } else {
        questionnaireRef = doc(collection(db, 'questionnaires'));
    }
    
    const { id, ...dataToSave } = questionnaire;

    await setDoc(questionnaireRef, {
        ...dataToSave,
        lastUpdated: serverTimestamp()
    }, { merge: true });

    return questionnaireRef.id;
};

export const getQuestionnaire = async (domain: string): Promise<Questionnaire | null> => {
    // Query for all questionnaires with the specified domain.
    // This avoids needing a composite index in Firestore by sorting client-side.
    const q = query(
        collection(db, 'questionnaires'), 
        where("domain", "==", domain)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        return null;
    }

    // Sort the results by version number in descending order to find the latest version.
    const questionnaires = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Questionnaire));
    questionnaires.sort((a, b) => b.versionNumber - a.versionNumber);
    
    // Return the questionnaire with the highest version number.
    return questionnaires[0];
};
