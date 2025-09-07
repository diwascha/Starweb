
import { TripSheetForm } from '@/app/fleet/trip-sheets/new/_components/trip-sheet-form';
import { getTrip } from '@/services/trip-service';

// This is a Server Component that fetches initial data
export default async function EditTripSheetPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialTrip = await getTrip(id);

  if (!initialTrip) {
    return <div>Trip sheet not found.</div>;
  }

  return <TripSheetForm tripToEdit={initialTrip} />;
}
