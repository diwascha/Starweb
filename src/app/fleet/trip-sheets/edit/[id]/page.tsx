'use client';
export const runtime = 'nodejs';

import { TripSheetForm } from '@/app/fleet/trip-sheets/new/_components/trip-sheet-form';
import { getTrip } from '@/services/trip-service';
import { use } from 'react';

// This is a Server Component that fetches initial data
export default function EditTripSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const initialTrip = use(getTrip(id));

  if (!initialTrip) {
    return <div>Trip sheet not found.</div>;
  }

  return <TripSheetForm tripToEdit={initialTrip} />;
}
