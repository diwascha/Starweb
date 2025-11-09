
"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { getDatabase, ref, onValue, off } from "firebase/database";
import { app } from '@/lib/firebase';

const ConnectionStatusContext = createContext<boolean>(true);

export function ConnectionStatusProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState<boolean>(true);

  useEffect(() => {
    const db = getDatabase(app);
    const connectedRef = ref(db, '.info/connected');

    const listener = onValue(connectedRef, (snap) => {
      setIsConnected(snap.val() === true);
    });

    return () => {
      off(connectedRef, 'value', listener);
    };
  }, []);

  return (
    <ConnectionStatusContext.Provider value={isConnected}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatus() {
  return useContext(ConnectionStatusContext);
}
