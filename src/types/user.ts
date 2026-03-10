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
  email: string;
  fullName: string;
  displayName: string;
  mobile: string;
  role: 'admin' | 'superadmin' | 'caretaker' | 'patient';
  preferredLanguage?: string;
  canImpersonate?: boolean;
  address?: string;
  city?: string;
  country?: string;
  preferredModel?: 'xbot' | 'corpo';
}