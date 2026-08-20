
'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { startSession, updateHeartbeat, endSession, onSessionRevoked } from '@/services/session-service';
import { generateId } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const DEVICE_ID_KEY = 'ss_device_id';
const DEVICE_NAME_KEY = 'ss_device_name';
const HEARTBEAT_INTERVAL = 60 * 1000; // 1 minute

/**
 * @fileOverview Background component that handles user session lifecycle.
 * Mounted at the root layout to ensure global tracking.
 */
export function SessionManager() {
    const { user, logout } = useAuth();
    const { toast } = useToast();
    const sessionIdRef = useRef<string | null>(null);
    const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
    const listenerUnsubRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const initializeSession = async () => {
            if (!user || sessionIdRef.current) return;

            // 1. Resolve Device Identity
            let deviceId = localStorage.getItem(DEVICE_ID_KEY);
            if (!deviceId) {
                deviceId = generateId();
                localStorage.setItem(DEVICE_ID_KEY, deviceId);
            }

            // 2. Resolve Device Name (Label)
            let deviceName = localStorage.getItem(DEVICE_NAME_KEY);
            if (!deviceName) {
                deviceName = `WS-${deviceId.substring(0, 4).toUpperCase()}`;
                localStorage.setItem(DEVICE_NAME_KEY, deviceName);
            }

            try {
                // 3. Register Session
                const sid = await startSession(
                    { id: user.id, username: user.username }, 
                    deviceId,
                    deviceName
                );
                sessionIdRef.current = sid;

                // 4. Setup Remote Revocation Listener
                listenerUnsubRef.current = onSessionRevoked(sid, () => {
                    toast({ 
                        title: 'Session Revoked', 
                        description: 'This session has been remotely terminated by an administrator.', 
                        variant: 'destructive' 
                    });
                    logout();
                });

                // 5. Setup Heartbeat
                heartbeatRef.current = setInterval(() => {
                    if (sessionIdRef.current) updateHeartbeat(sessionIdRef.current);
                }, HEARTBEAT_INTERVAL);

            } catch (e) {
                console.error("Session initialization failed", e);
            }
        };

        const cleanupSession = async () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            if (listenerUnsubRef.current) listenerUnsubRef.current();
            if (sessionIdRef.current) {
                await endSession(sessionIdRef.current);
                sessionIdRef.current = null;
            }
        };

        if (user) {
            initializeSession();
        } else {
            cleanupSession();
        }

        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            if (listenerUnsubRef.current) listenerUnsubRef.current();
        };
    }, [user, logout, toast]);

    return null;
}
