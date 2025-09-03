
'use client';

import { useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Membership } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function MembershipsPage() {
    const [memberships, setMemberships] = useLocalStorage<Membership[]>('memberships', []);
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

        if (memberships.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No memberships found</h3>
                    <p className="text-sm text-muted-foreground">Get started by adding a new membership.</p>
                    <Button className="mt-4">
                        <Plus className="mr-2 h-4 w-4" /> Add Membership
                    </Button>
                  </div>
                </div>
            );
        }

        // Placeholder for table when data exists
        return (
            <div>
                {/* Table will be implemented here */}
                <p>Membership table will go here.</p>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Memberships</h1>
                    <p className="text-muted-foreground">Manage your fleet memberships and associations.</p>
                </div>
                {isClient && memberships.length > 0 && (
                     <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Membership
                    </Button>
                )}
            </header>
            {renderContent()}
        </div>
    );
}
