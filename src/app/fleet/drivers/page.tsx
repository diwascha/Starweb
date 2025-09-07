
export const runtime = 'nodejs';
import { getDrivers } from '@/services/driver-service';
import DriversClientPage from './_components/drivers-client-page';

export default async function DriversPage() {
    const initialDrivers = await getDrivers();
    
    return <DriversClientPage initialDrivers={initialDrivers} />;
}
