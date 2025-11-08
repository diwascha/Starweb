
import { TripSheetForm } from '@/app/fleet/trip-sheets/new/_components/trip-sheet-form';
import { getTrip, getTrips } from '@/services/trip-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.TAURI_BUILD === 'true';
  if (!isDesktop) {
    return [];
  }
  const trips = await getTrips();
  if (!trips || trips.length === 0) {
    return [];
  }
  return trips.map(trip => ({ id: trip.id }));
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
