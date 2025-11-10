
"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useDatabaseService } from '@/lib/firebase/provider';
import { ref, onValue, off } from 'firebase/database';


const ConnectionStatusContext = createContext<boolean>(true);

// This component is now a simple display component.
// The logic has been moved to FirebaseProvider.
export function ConnectionStatusIndicator() {
  const isConnected = useConnectionStatus();

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


export function useConnectionStatus() {
  return useContext(ConnectionStatusContext);
}

// The provider logic is now inside FirebaseProvider
export { ConnectionStatusContext };
