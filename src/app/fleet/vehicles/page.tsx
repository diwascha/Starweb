
import VehiclesClientPage from './_components/vehicles-client-page';

export default function VehiclesPage() {
    // We will now fetch all data on the client to ensure real-time updates.
    // Passing initial empty arrays and letting the client component handle everything.
    return <VehiclesClientPage initialVehicles={[]} initialDrivers={[]} />;
}
