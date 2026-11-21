
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { AppUser } from '../types/user';
import { T, useTranslationContext } from './T';
import { Shield, ShieldAlert, User, Check, X, Search } from 'lucide-react';
import styles from './UserManagement.module.css';
import { setUserRole, callableErrorMessage } from '../services/userService';

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [roleError, setRoleError] = useState<string | null>(null);
    const currentUid = auth.currentUser?.uid;
    const { language } = useTranslationContext();
    const isRtl = language === 'he';
    const direction = isRtl ? 'rtl' : 'ltr';

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);
            try {
                const usersRef = collection(db, 'users');
                const q = query(usersRef);
                const querySnapshot = await getDocs(q);
                const usersList = querySnapshot.docs.map(doc => ({
                    uid: doc.id,
                    ...doc.data()
                })) as AppUser[];
                setUsers(usersList);
            } catch (error) {
                console.error('Error fetching users:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, []);

    // Role changes go through the setUserRole Cloud Function (spec F4–F6): superadmin only, never
    // one's own role, no demotion to learner while the caretaker has patients, one superadmin remains.
    const handleUpdateRole = async (userId: string, newRole: AppUser['role']) => {
        setUpdatingUserId(userId);
        setRoleError(null);
        try {
            await setUserRole(userId, newRole);
            setUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole } : u));
        } catch (error) {
            console.error('Error updating role:', error);
            setRoleError(callableErrorMessage(error, 'Failed to update role. Check permissions.'));
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleToggleImpersonation = async (userId: string, currentValue: boolean) => {
        setUpdatingUserId(userId);
        try {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, { canImpersonate: !currentValue, updatedTimestamp: serverTimestamp() });
            setUsers(prev => prev.map(u => u.uid === userId ? { ...u, canImpersonate: !currentValue } : u));
        } catch (error) {
            console.error('Error updating impersonation:', error);
            alert('Failed to update impersonation flag.');
        } finally {
            setUpdatingUserId(null);
        }
    };

    const filteredUsers = users.filter(user =>
        user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return <div className={styles.loading}><T>Loading users...</T></div>;
    }

    return (
        <div className={styles.container} dir={direction}>
            <header className={styles.header}>
                <h1><T>User Management</T></h1>
                <div className={styles.searchBar}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            {roleError && (
                <div role="alert" className="mb-3 p-3 rounded-lg bg-red-50 text-red-800 border border-red-200">
                    <T>{roleError}</T>
                </div>
            )}

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th><T>Name</T></th>
                            <th><T>Email</T></th>
                            <th><T>Role</T></th>
                            <th className={styles.centerAlign}><T>Can Impersonate</T></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.uid} className={updatingUserId === user.uid ? styles.updating : ''}>
                                <td>{user.fullName || <T>Anonymous</T>}</td>
                                <td>{user.email}</td>
                                <td>
                                    <select
                                        value={user.role || ''}
                                        onChange={(e) => handleUpdateRole(user.uid, e.target.value as AppUser['role'])}
                                        className={styles.roleSelect}
                                        disabled={user.uid === currentUid || updatingUserId === user.uid}
                                    >
                                        <option value="learner"><T>Learner</T></option>
                                        <option value="caretaker"><T>Caretaker</T></option>
                                        <option value="admin"><T>Admin</T></option>
                                        <option value="superadmin"><T>SuperAdmin</T></option>
                                    </select>
                                </td>
                                <td className={styles.centerAlign}>
                                    <button
                                        onClick={() => handleToggleImpersonation(user.uid, !!user.canImpersonate)}
                                        className={`${styles.toggleBtn} ${user.canImpersonate ? styles.active : ''}`}
                                    >
                                        {user.canImpersonate ? <Check size={16} /> : <X size={16} />}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserManagement;
