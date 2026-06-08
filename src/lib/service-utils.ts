
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

/**
 * Standard error logger for services.
 */
export const logServiceError = (context: string, error: any) => {
  console.error(`[Service Error: ${context}]`, error?.message || error);
};
