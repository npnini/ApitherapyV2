import React from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './PageTitle.module.css';

interface PageTitleProps {
    /** The page's icon: use the same icon as the page's sidebar item. */
    icon: LucideIcon;
    children: React.ReactNode;
    /** The page's own title class (font size); the shared colour and spacing come from here. */
    titleClassName?: string;
    /** Optional one-line description under the title. */
    subtitle?: React.ReactNode;
}

/**
 * Page title with an icon in a navy-tinted tile (UI redesign Tier 2), as on the Patients and Today pages.
 */
const PageTitle: React.FC<PageTitleProps> = ({ icon: Icon, children, titleClassName, subtitle }) => (
    <div className={styles.pageTitle}>
        <span className={styles.icon} aria-hidden="true"><Icon size={22} /></span>
        <div className={styles.text}>
            <h1 className={`${styles.title} ${titleClassName || ''}`}>{children}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
    </div>
);

export default PageTitle;
