export interface AppUser {
    uid: string; // Firebase Authentication user ID
    userId: string; // The custom, human-readable user ID
    email: string;
    fullName: string;
    displayName: string;
    photoURL?: string;
    role: 'admin' | 'caretaker'; 
    mobile: string;
    address?: string;
    city?: string;
    country?: string;
    preferredLanguage?: string;
}
