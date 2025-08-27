'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Report } from '@/lib/types';

const generateNextSerialNumber = (reports: Report[]): string => {
  const serialPrefix = '2082/083-';
  let maxNumber = 0;

  reports.forEach(report => {
    if (report && report.serialNumber && report.serialNumber.startsWith(serialPrefix)) {
      const numPart = parseInt(report.serialNumber.substring(serialPrefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNumber) {
        maxNumber = numPart;
      }
    }
  });

  const nextNumber = maxNumber + 1;
  return `${serialPrefix}${nextNumber.toString().padStart(3, '0')}`;
};

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.log(error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    setStoredValue(prevValue => {
      const valueToStore = value instanceof Function ? value(prevValue) : value;
      
      // If we're updating reports, and it's an array, handle serial number generation
      if (key === 'reports' && Array.isArray(valueToStore)) {
        const prevReports = (Array.isArray(prevValue) ? prevValue : []) as Report[];
        const newReports = valueToStore as Report[];

        // Check if a new report is being added (the one without a serial number yet)
        if (newReports.length > prevReports.length) {
            const newReport = newReports.find(r => !r.serialNumber);
            if (newReport) {
                // Generate serial number based on the complete list *before* this new one
                const reportsForNumbering = newReports.filter(r => r.id !== newReport.id);
                newReport.serialNumber = generateNextSerialNumber(reportsForNumbering);
            }
        }
      }
      
      return valueToStore;
    });
  }, [key]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const valueToStore = JSON.stringify(storedValue);
        window.localStorage.setItem(key, valueToStore);
      }
    } catch (error) {
      console.log(error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
}

export default useLocalStorage;
