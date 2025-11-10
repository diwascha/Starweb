
"use client";

import { useState, useEffect } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue, off } from 'firebase/database';

export function ConnectionStatusIndicator() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    if (!rtdb) return;

    const connectedRef = ref(rtdb, '.info/connected');

    const listener = onValue(connectedRef, (snap) => {
        const connected = snap.val() === true;
        setIsConnected(connected);
    }, (error) => {
        console.error("Connection status listener error:", error);
        setIsConnected(false);
    });

    return () => {
        off(connectedRef, 'value', listener);
    };
  }, []);

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      {isConnected ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span>Online</span>
        </>
      ) : (
        <>
           <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span>Offline</span>
        </>
      )}
    </div>
  );
}
