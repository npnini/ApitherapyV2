export interface AppUser {
    userId: string;
    email: string;
    displayName: string;
    photoURL: string;
    role?: string; // Add role as an optional property
}
