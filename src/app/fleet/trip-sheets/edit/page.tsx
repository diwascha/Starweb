'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TripSheetForm } from '../new/_components/trip-sheet-form';
import { getTrip } from '@/services/trip-service';
import type { Trip } from '@/lib/types';
import { Loader2 } from 'lucide-react';

function EditTripSheetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getTrip(id)
        .then(data => {
            setTrip(data);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id]);

  if (loading) {
    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Loading trip data...</p>
        </div>
    );
  }
  
  if (!trip) return <div className="p-12 text-center">Trip sheet not found.</div>;

  return <TripSheetForm tripToEdit={trip} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Initializing...</div>}>
      <EditTripSheetContent />
    </Suspense>
  );
}
