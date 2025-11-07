
import { TripSheetForm } from '@/app/fleet/trip-sheets/new/_components/trip-sheet-form';
import { getTrip, onTripsUpdate } from '@/services/trip-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
  if (!isDesktop) {
    return [];
  }
  // This is tricky as we can't await onSnapshot here. We'll fetch the current state.
  // A helper function in the service would be better, but this will work.
  return new Promise(resolve => {
    const unsub = onTripsUpdate(trips => {
      unsub(); // Unsubscribe immediately after getting the data
      resolve(trips.map(trip => ({ id: trip.id })));
    });
  });
}

// This is a Server Component that fetches initial data
export default async function EditTripSheetPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialTrip = await getTrip(id);

  if (!initialTrip) {
    return <div>Trip sheet not found.</div>;
  }

  return <TripSheetForm tripToEdit={initialTrip} />;
}
