
import { getVehicles } from '@/services/vehicle-service';
import { getDrivers } from '@/services/driver-service';
import VehiclesClientPage from './_components/vehicles-client-page';

export default async function VehiclesPage() {
    const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
    const initialVehicles = isDesktop ? [] : await getVehicles();
    const initialDrivers = isDesktop ? [] : await getDrivers();
    
    return <VehiclesClientPage initialVehicles={initialVehicles} initialDrivers={initialDrivers} />;
}
