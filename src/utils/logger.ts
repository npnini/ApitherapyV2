/**
 * Logger utility to centralize console logging.
 * Logs are only displayed in development mode (import.meta.env.DEV).
 * Errors and critical warnings are kept in production for troubleshooting.
 */

export const logger = {
  log: (...args: any[]) => {
    if (import.meta.env.DEV) {
      console.log(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (import.meta.env.DEV) {
      console.info(...args);
    }
  },

  warn: (...args: any[]) => {
    // We keep warnings in production as they often indicate non-fatal but important issues
    console.warn(...args);
  },

  error: (...args: any[]) => {
    // Errors are always kept in production
    console.error(...args);
  },

  /**
   * Special tracer for important flow debugging.
   * Only active in DEV.
   */
  trace: (label: string, ...args: any[]) => {
    if (import.meta.env.DEV) {
      console.log(`[TRACER] ${label}:`, ...args);
    }
  }
};

export default logger;
