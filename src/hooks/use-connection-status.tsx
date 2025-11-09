"use client";

import { useState, useEffect } from 'react';
import { getDatabase, ref, onValue, off } from "firebase/database";
import { app } from '@/lib/firebase';

export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState<boolean>(true); // Assume online initially

  useEffect(() => {
    // The Realtime Database's .info/connected is a good proxy for general Firebase connectivity.
    // It's lightweight and designed for this purpose.
    const db = getDatabase(app);
    const connectedRef = ref(db, '.info/connected');

    const listener = onValue(connectedRef, (snap) => {
      setIsConnected(snap.val() === true);
    });

    // Cleanup listener on component unmount
    return () => {
      off(connectedRef, 'value', listener);
    };
  }, []);

  return isConnected;
}
