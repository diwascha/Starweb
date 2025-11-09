
import DriversClientPage from './_components/drivers-client-page';
import { getDrivers } from '@/services/driver-service';

export default async function DriversPage() {
    const initialDrivers = await getDrivers();
    return <DriversClientPage initialDrivers={initialDrivers} />;
}
