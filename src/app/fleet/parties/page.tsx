
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Search, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { onPartiesUpdate } from '@/services/party-service';
import { useRouter } from 'next/navigation';

export default function PartiesPage() {
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();
    const { hasPermission } = useAuth();

    useEffect(() => {
        setIsLoading(true);
        const unsubscribe = onPartiesUpdate(setParties);
        setIsLoading(false);
        return () => unsubscribe();
    }, []);

    const filteredParties = useMemo(() => {
        if (!searchQuery) return parties;
        const lowercasedQuery = searchQuery.toLowerCase();
        return parties.filter(p =>
            p.name.toLowerCase().includes(lowercasedQuery) ||
            p.type.toLowerCase().includes(lowercasedQuery) ||
            (p.panNumber || '').toLowerCase().includes(lowercasedQuery)
        );
    }, [parties, searchQuery]);

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                    <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
                </div>
            );
        }

        if (parties.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No parties found</h3>
                    <p className="text-sm text-muted-foreground">Vendors and clients will appear here once added.</p>
                  </div>
                </div>
            );
        }

        return (
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>PAN Number</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredParties.map(party => (
                            <TableRow key={party.id}>
                                <TableCell>{party.name}</TableCell>
                                <TableCell>{party.type}</TableCell>
                                <TableCell>{party.panNumber || 'N/A'}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" onClick={() => router.push(`/fleet/ledger/${party.id}`)}>
                                        <Eye className="mr-2 h-4 w-4" /> View Ledger
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div className="mb-4 md:mb-0">
                    <h1 className="text-3xl font-bold tracking-tight">Parties</h1>
                    <p className="text-muted-foreground">View ledgers for all your clients and vendors.</p>
                </div>
                 {parties.length > 0 && (
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search parties..."
                            className="pl-8 sm:w-[200px] md:w-[300px]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}
            </header>
            {renderContent()}
        </div>
    );
}
