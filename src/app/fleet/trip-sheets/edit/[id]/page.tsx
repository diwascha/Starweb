
import { TripSheetForm } from '../../new/_components/trip-sheet-form';
import { getTrip, getTrips } from '@/services/trip-service';


// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
    const trips = await getTrips();
    if (!trips || trips.length === 0) {
      return [];
    }
    return trips.map((trip) => ({
      id: trip.id,
    }));
}

// This is a Server Component that fetches initial data
export default async function EditTripSheetPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialTrip = await getTrip(id);

  if (!initialTrip) {
    return (
        <main className="p-6">
            <h1 className="text-xl font-semibold text-destructive">Error</h1>
            <p>Trip sheet with ID "{id}" was not found.</p>
        </main>
    );
  }

  return <TripSheetForm tripToEdit={initialTrip} />;
}
