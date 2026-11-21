import { useEffect, useRef } from 'react';
import { getUserTermsConfig } from '../services/userService';
import { hasValidTermsAcceptance } from '../types/userTerms';
import { logger } from '../utils/logger';

/** Local hour at which open sessions without acceptance of the current User Terms are signed out. */
const SIGN_OUT_HOUR = 2;
/** How often the check runs while the app is open (a 2 AM is detected within this time). */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** The most recent 2 AM (local time of this device) at or before `now`, in milliseconds. */
function lastSignOutTime(now: number): number {
    const d = new Date(now);
    d.setHours(SIGN_OUT_HOUR, 0, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
}

/**
 * Signs the user out at 2 AM local time when a newer User Terms version was published during the
 * session and the user has not accepted it (decided 21/11/2026).
 *
 * Why: a publish must not interrupt work (e.g. a treatment in progress). The previous version stays
 * valid for 24 hours after a publish (security rules + publishUserTerms), and the first 2 AM after a
 * publish is always within those 24 hours. After the sign-out, the next sign-in shows the acceptance
 * screen. A session that already accepted the current version is not signed out.
 *
 * Browser timers do not run while a device sleeps, so besides the periodic check, the check also
 * runs when the app becomes visible, gets focus or comes back online: a 2 AM that passed while the
 * device slept is caught at the next wake. A failed read (offline) is retried at the next trigger.
 */
export function useNightlyTermsSignOut(
    user: { uid: string; termsVersion?: string } | null,
    signOut: () => Promise<void>,
): void {
    const userRef = useRef(user);
    userRef.current = user;
    const signOutRef = useRef(signOut);
    signOutRef.current = signOut;

    const uid = user?.uid;
    useEffect(() => {
        if (!uid) return;
        let lastCheck = Date.now();
        let running = false;

        const check = async () => {
            const now = Date.now();
            // Nothing to do unless a 2 AM has passed since the last completed check
            if (running || lastCheck >= lastSignOutTime(now)) return;
            running = true;
            try {
                const cfg = await getUserTermsConfig();
                lastCheck = now;
                if (!hasValidTermsAcceptance(userRef.current, cfg)) {
                    logger.info(`Signing out at night: User Terms version ${cfg.currentVersion} not accepted in this session.`);
                    await signOutRef.current();
                }
            } catch (err) {
                logger.warn('Nightly User Terms check failed; retrying at the next check:', err);
            } finally {
                running = false;
            }
        };

        const onVisible = () => { if (document.visibilityState === 'visible') check(); };
        const interval = window.setInterval(check, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', check);
        window.addEventListener('online', check);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', check);
            window.removeEventListener('online', check);
        };
    }, [uid]);
}
