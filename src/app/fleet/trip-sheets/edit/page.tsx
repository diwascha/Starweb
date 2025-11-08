
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TripSheetForm } from '@/app/fleet/trip-sheets/new/_components/trip-sheet-form';
import { getTrip } from '@/services/trip-service';
import { useEffect, useState } from 'react';
import type { Trip } from '@/lib/types';

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
        .catch(() => setError('Failed to load trip sheet.'))
        .finally(() => setLoading(false));
    } else {
        setError('No trip sheet ID provided.');
        setLoading(false);
    }
  }, [id]);

  if (loading) {
    return <main className="p-6">Loading trip sheet...</main>;
  }

  if (error) {
      return <main className="p-6">{error}</main>;
  }
  
  if (!trip) {
       return <main className="p-6">Trip sheet not found.</main>;
  }

  return <TripSheetForm tripToEdit={trip} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <EditTripSheetComponent />
    </Suspense>
  )
}
