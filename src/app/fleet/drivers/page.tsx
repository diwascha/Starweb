
'use client';

import { useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Driver } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function DriversPage() {
    const [drivers, setDrivers] = useLocalStorage<Driver[]>('drivers', []);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const renderContent = () => {
        if (!isClient) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
                </div>
            );
        }

        if (drivers.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No drivers found</h3>
                    <p className="text-sm text-muted-foreground">Get started by adding a new driver.</p>
                    <Button className="mt-4">
                        <Plus className="mr-2 h-4 w-4" /> Add Driver
                    </Button>
                  </div>
                </div>
            );
        }

        // Placeholder for table when data exists
        return (
            <div>
                {/* Table will be implemented here */}
                <p>Driver table will go here.</p>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
                    <p className="text-muted-foreground">Manage your driver records.</p>
                </div>
                {isClient && drivers.length > 0 && (
                     <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Driver
                    </Button>
                )}
            </header>
            {renderContent()}
        </div>
    );
}
