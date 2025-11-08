
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TripSheetForm } from '@/app/fleet/trip-sheets/new/_components/trip-sheet-form';
import { getTrip } from '@/services/trip-service';
import type { Trip } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

function EditTripSheetComponent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getTrip(id)
        .then(data => {
          if (data) {
            setTrip(data);
          } else {
            setError('Trip sheet not found.');
          }
        })
        .catch(() => setError('Failed to load trip sheet data.'))
        .finally(() => setLoading(false));
    } else {
        setError('No trip sheet ID provided in the URL.');
        setLoading(false);
    }
  }, [id]);

  if (loading) {
    return <main className="p-6"><Skeleton className="h-24 w-full" /></main>;
  }

  if (error) {
      return (
        <main className="p-6">
            <h1 className="text-xl font-semibold text-destructive">Error</h1>
            <p>{error}</p>
        </main>
      );
  }
  
  if (!trip) {
       return (
        <main className="p-6">
            <h1 className="text-xl font-semibold text-destructive">Error</h1>
            <p>Could not find the trip sheet to edit.</p>
        </main>
       );
  }

  return <TripSheetForm tripToEdit={trip} />;
}

export default function EditTripSheetPage() {
  return (
    <Suspense fallback={<main className="p-6"><Skeleton className="h-24 w-full" /></main>}>
      <EditTripSheetComponent />
    </Suspense>
  );
}
