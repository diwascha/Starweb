'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Party } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ArrowUpDown } from 'lucide-react';
import { onPartiesUpdate } from '@/services/party-service';


type PartySortKey = 'name' | 'type';
type SortDirection = 'asc' | 'desc';


export default function PartyLedgerRedirectPage() {
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: PartySortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubscribe = onPartiesUpdate((data) => {
            setParties(data);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const requestSort = (key: PartySortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredParties = useMemo(() => {
        let filtered = [...parties];
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(lowercasedQuery) || p.type.toLowerCase().includes(lowercasedQuery));
        }

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [parties, searchQuery, sortConfig]);

    if (isLoading) {
        return <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24"><p>Loading...</p></div>;
    }

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Party Ledger</h1>
                    <p className="text-muted-foreground">Select a party to view their transaction ledger.</p>
                </div>
                 <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search parties..."
                        className="pl-8 w-full md:w-auto"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </header>

            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>
                                <Button variant="ghost" onClick={() => requestSort('name')}>
                                    Name <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead>
                                <Button variant="ghost" onClick={() => requestSort('type')}>
                                    Type <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>PAN</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredParties.length > 0 ? (
                            sortedAndFilteredParties.map((party) => (
                                <TableRow key={party.id} className="cursor-pointer" onClick={() => router.push(`/fleet/ledger/${party.id}`)}>
                                    <TableCell className="font-medium">{party.name}</TableCell>
                                    <TableCell>{party.type}</TableCell>
                                    <TableCell>{party.address}</TableCell>
                                    <TableCell>{party.panNumber}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No parties found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
