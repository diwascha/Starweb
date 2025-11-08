
import { ReportForm } from '@/app/report/new/_components/report-form';
import { getTrip, getTrips } from '@/services/trip-service';
import { TripSheetForm } from '../../new/_components/trip-sheet-form';


// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.TAURI_BUILD === 'true';
  // For desktop builds, we must pre-render all possible pages.
  // For web builds, this could be an empty array to generate pages on-demand.
  if (!isDesktop) {
    return [];
  }
  try {
    const trips = await getTrips(); // Fetch all trips to generate params
    if (!trips || trips.length === 0) {
      return [];
    }
    return trips.map((trip) => ({
      id: trip.id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for edit trip sheets:", error);
    return [];
  }
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
