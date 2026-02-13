
import React from 'react';
import styles from './PatientIntakeNav.module.css';
import { useTranslation } from 'react-i18next';

interface PatientIntakeNavProps {
  activePage: string;
  setActivePage: (page: string) => void;
}

const PatientIntakeNav: React.FC<PatientIntakeNavProps> = ({ activePage, setActivePage }) => {
  const { t } = useTranslation();
  const navItems = [
    { id: 'Personal', label: t('personal_details') },
    { id: 'Medical Record', label: t('medical_record') },
    { id: 'Questionnaire', label: t('questionnaire') },
  ];

  const activeIndex = navItems.findIndex(item => item.id === activePage);

  return (
    <nav className={styles.navContainer}>
      <ul className={styles.navList}>
        {navItems.map((item, index) => (
          <li
            key={item.id}
            className={`${styles.navItem} ${index === activeIndex ? styles.active : index < activeIndex ? styles.completed : ''}`}
            onClick={() => setActivePage(item.id)}
          >
            <div className={styles.stepNumber}>{index + 1}</div>
            <span className={styles.stepLabel}>{item.label}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default PatientIntakeNav;
