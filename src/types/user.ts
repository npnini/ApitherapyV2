export interface AppUser {
    uid: string; // Firebase Authentication user ID
    userId: string; // The custom, human-readable user ID
    email: string;
    fullName: string;
    photoURL?: string;
    role?: 'admin' | 'caretaker' | 'user'; 
    mobile?: string;
}
