/**
 * cfg_app_config/userTerms (Functional Spec – Registration, Roles, Plans and User Terms, §4).
 * Written by Cloud Functions only (saveUserTermsFile, publishUserTerms).
 */
export interface UserTermsFile {
  /** Storage path under App_config/user_documents/ */
  path: string;
  uploadedTimestamp?: any;
}

export interface UserTermsVersion {
  status: 'draft' | 'published';
  publishedTimestamp?: any;
  /** Keyed by language code, e.g. 'he', 'en' */
  files?: Record<string, UserTermsFile>;
}

export interface UserTermsConfig {
  /** The version users must accept. Missing until the first version is published. */
  currentVersion?: string;
  /**
   * Set by publishUserTerms: the version current before the last publish and the end of its
   * 24-hour grace period. The security rules accept it until then, so sessions open at publish
   * time keep working until the app signs them out at 2 AM (useNightlyTermsSignOut).
   * A new sign-in always requires the current version.
   */
  previousVersion?: string;
  previousValidUntil?: any;
  versions?: Record<string, UserTermsVersion>;
}

/**
 * Valid acceptance rule (spec §5): while no version is published the check is not applied;
 * otherwise the user's termsVersion must equal currentVersion.
 */
export const hasValidTermsAcceptance = (
  user: { termsVersion?: string } | null | undefined,
  cfg: UserTermsConfig | null | undefined,
): boolean => {
  if (!cfg?.currentVersion) return true;
  return user?.termsVersion === cfg.currentVersion;
};
