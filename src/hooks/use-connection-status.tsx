'use client';
/**
 * Redundant hook removed. Core connectivity is now handled via FirebaseProvider
 * and the .info/connected listener. Authentication and permissions are managed
 * exclusively in @/hooks/use-auth.
 */
export const useConnectionStatus = () => true;
