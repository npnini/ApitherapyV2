import React, { useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { useT } from './T';
import styles from './MobileNav.module.css';

interface MobileNavProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The sidebar; shown inside the drawer. */
    children: React.ReactNode;
}

/**
 * Navigation for narrow screens (phones, tablets in portrait): a slim top bar with a menu button,
 * and the sidebar as a drawer that slides in over the page. The drawer closes after a choice is
 * made, unless the button has the attribute data-keep-nav-open (the buttons that only expand a group).
 */
const MobileNav: React.FC<MobileNavProps> = ({ open, onOpenChange, children }) => {
    const tOpenMenu = useT('Open menu');
    const tCloseMenu = useT('Close menu');

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onOpenChange]);

    const handleDrawerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const button = (e.target as HTMLElement).closest('button');
        if (button && !button.hasAttribute('data-keep-nav-open')) onOpenChange(false);
    };

    return (
        <>
            <header className={styles.topBar}>
                <button
                    type="button"
                    className={styles.menuButton}
                    onClick={() => onOpenChange(true)}
                    aria-label={tOpenMenu}
                    aria-expanded={open}
                >
                    <Menu size={24} aria-hidden="true" />
                </button>
                <span className={styles.appName}>APITHERAPYCARE</span>
            </header>

            {open && <div className={styles.backdrop} onClick={() => onOpenChange(false)} />}

            <div
                className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
                onClick={handleDrawerClick}
                aria-hidden={!open}
            >
                <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => onOpenChange(false)}
                    aria-label={tCloseMenu}
                    tabIndex={open ? 0 : -1}
                >
                    <X size={20} aria-hidden="true" />
                </button>
                {children}
            </div>
        </>
    );
};

export default MobileNav;
