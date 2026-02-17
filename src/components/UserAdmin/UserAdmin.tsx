import React, { useState } from 'react';
import { collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../../firebase';
import { User } from '../../types/user';
import UserList from './UserList';
import UserDetails from './UserDetails';
import styles from './UserAdmin.module.css';
import { useTranslation } from 'react-i18next';

const UserAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [usersCollection, loading, error] = useCollection(collection(db, 'users'));
  const users = usersCollection?.docs.map(doc => ({ ...doc.data(), id: doc.id })) as User[];

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
  };

  const handleSaveUser = async (user: User) => {
    if (user.id) {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, { ...user, updatedAt: serverTimestamp() });
    }
    setSelectedUser(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('user_management_title')}</h1>
      </div>
      {loading && <p>{t('loading_users')}</p>}
      {error && <p>Error loading users.</p>}
      {users && <UserList users={users} onSelectUser={handleSelectUser} />}
      {selectedUser && (
        <UserDetails
          user={selectedUser}
          onBack={() => setSelectedUser(null)}
          onSave={handleSaveUser}
        />
      )}
    </div>
  );
};

export default UserAdmin;
