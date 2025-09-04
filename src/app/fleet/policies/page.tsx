
'use client';

import { useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { PolicyOrMembership } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export default function PoliciesPage() {
    const [policies, setPolicies] = useLocalStorage<PolicyOrMembership[]>('policies', []);
    const [isClient, setIsClient] = useState(false);
    const { hasPermission } = useAuth();

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

        if (policies.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No policies or memberships found</h3>
                    <p className="text-sm text-muted-foreground">Get started by adding a new record.</p>
                    {hasPermission('fleet', 'create') && (
                        <Button className="mt-4">
                            <Plus className="mr-2 h-4 w-4" /> Add Record
                        </Button>
                    )}
                  </div>
                </div>
            );
        }

        // Placeholder for table when data exists
        return (
            <div>
                {/* Table will be implemented here */}
                <p>Policies and memberships table will go here.</p>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Policies & Memberships</h1>
                    <p className="text-muted-foreground">Manage your vehicle insurance and fleet memberships.</p>
                </div>
                {isClient && policies.length > 0 && hasPermission('fleet', 'create') && (
                     <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Record
                    </Button>
                )}
            </header>
            {renderContent()}
        </div>
    );
}
