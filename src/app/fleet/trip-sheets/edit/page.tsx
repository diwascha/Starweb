'use client';

import { Suspense, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { TripSheetForm } from '../new/_components/trip-sheet-form';
import { getTrip } from '@/services/trip-service';
import type { Trip } from '@/lib/types';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Consolidated Edit page for Sales - Trip Sheets.
 */

function EditTripSheetContent(props: { searchParams: Promise<any> }) {
  const router = useRouter();
  const searchParams = use(props.searchParams);
  const id = searchParams.id;
  
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

export default function Page(props: { params: Promise<any>, searchParams: Promise<any> }) {
  return (
    <Suspense fallback={<div className="p-6 text-center">Initializing...</div>}>
      <EditTripSheetContent searchParams={props.searchParams} />
    </Suspense>
  );
}
