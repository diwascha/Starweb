/**
 * Utility functions for common service layer operations.
 */
import { getFirebase } from './firebase';
import { writeBatch, type DocumentReference } from 'firebase/firestore';

export const createTimestamp = () => new Date().toISOString();

/**
 * Deletes an arbitrary number of documents, chunked to stay under
 * Firestore's 500-operation-per-batch hard limit. A plain writeBatch()
 * over an unbounded list of refs throws once it crosses 500 and the
 * whole batch is rejected - nothing gets deleted, silently, if that
 * error isn't awaited and surfaced. Always await this and let any
 * rejection propagate to the caller.
 */
export const deleteDocsInChunks = async (refs: DocumentReference[], chunkSize = 400): Promise<void> => {
    const { db } = getFirebase();
    for (let i = 0; i < refs.length; i += chunkSize) {
        const batch = writeBatch(db);
        refs.slice(i, i + chunkSize).forEach(ref => batch.delete(ref));
        await batch.commit();
    }
};

/**
 * Ensures numeric fields are actually numbers, even if stored as strings in DB.
 * Robustly extracts the first sequence of digits/decimals from a string.
 */
export const coerceNumber = (val: any, fallback: number = 0): number => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return val;
  
  // Strip commas and handle negative numbers
  const s = String(val).replace(/,/g, '');
  
  // Extract the first number found in the string (handles "Monthly 21500", "83.50/h")
  const match = s.match(/-?\d+(\.\d+)?/);
  if (match) {
    return parseFloat(match[0]);
  }
  
  return fallback;
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
