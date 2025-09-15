
import { getDrivers } from '@/services/driver-service';
import DriversClientPage from './_components/drivers-client-page';

// The IS_DESKTOP_BUILD environment variable will be used as the "build switch".
// When building for desktop (e.g., with Tauri), you would set this to "true".
const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';

export default async function DriversPage() {
    // For a web build, we fetch the data on the server (SSR).
    // For a desktop build, we pass an empty array, and the client component will fetch the data.
    const initialDrivers = isDesktop ? [] : await getDrivers();
    
    return <DriversClientPage initialDrivers={initialDrivers} />;
}
