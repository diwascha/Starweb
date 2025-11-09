
'use client';
import { TripSheetForm } from '../../new/_components/trip-sheet-form';
import { getTrip } from '@/services/trip-service';
import { useEffect, useState } from 'react';
import type { Trip } from '@/lib/types';


export default function EditTripSheetPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getTrip(id).then(data => {
        setTrip(data);
        setLoading(false);
      });
    }
  }, [id]);
  

  if (loading) {
    return (
        <main className="p-6">
            <h1 className="text-xl font-semibold">Loading...</h1>
        </main>
    );
  }

  if (!trip) {
    return (
        <main className="p-6">
            <h1 className="text-xl font-semibold text-destructive">Error</h1>
            <p>Trip sheet with ID "{id}" was not found.</p>
        </main>
    );
  }

  return <TripSheetForm tripToEdit={trip} />;
}
