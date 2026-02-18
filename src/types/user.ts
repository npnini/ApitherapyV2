export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt?: any;
  updatedAt?: any;
}

export interface AppUser {
  uid: string;
  userId: string;
  email: string;
  fullName: string;
  displayName: string;
  mobile: string;
  role: 'admin' | 'caretaker' | 'patient';
  preferredLanguage?: string;
}