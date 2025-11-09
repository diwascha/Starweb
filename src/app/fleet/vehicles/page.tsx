
import VehiclesClientPage from './_components/vehicles-client-page';
import { getVehicles } from '@/services/vehicle-service';
import { getDrivers } from '@/services/driver-service';

export default async function VehiclesPage() {
    const initialVehicles = await getVehicles();
    const initialDrivers = await getDrivers();
    return <VehiclesClientPage initialVehicles={initialVehicles} initialDrivers={initialDrivers} />;
}
