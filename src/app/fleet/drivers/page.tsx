
import DriversClientPage from './_components/drivers-client-page';

export default function DriversPage() {
    // We will now fetch all data on the client to ensure real-time updates.
    // Passing initial empty arrays and letting the client component handle everything.
    return <DriversClientPage initialDrivers={[]} />;
}
