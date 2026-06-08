
/**
 * Utility functions for common service layer operations.
 */

export const createTimestamp = () => new Date().toISOString();

/**
 * Ensures numeric fields are actually numbers, even if stored as strings in DB.
 */
export const coerceNumber = (val: any, fallback: number = 0): number => {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? fallback : num;
};

// Throttled logging to prevent performance degradation during errors
const errorLog = new Map<string, number>();

/**
 * Standard error logger for services.
 */
export const logServiceError = (context: string, error: any) => {
  const lastLog = errorLog.get(context) || 0;
  // Max 1 error per 5 seconds per context to avoid blocking the main thread
  if (Date.now() - lastLog > 5000) {
    if (process.env.NODE_ENV === 'development') {
        console.error(`[Service Error: ${context}]`, error?.message || error);
    }
    errorLog.set(context, Date.now());
  }
};
