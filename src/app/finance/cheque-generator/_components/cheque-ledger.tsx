'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow, 
    TableFooter 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
    Search, 
    ChevronLeft, 
    ChevronRight,
    FilterX,
    Users,
    CalendarIcon
} from 'lucide-react';
import { onChequesUpdate } from '@/services/cheque-service';
import type { Cheque } from '@/lib/types';
import { toNepaliDate, cn } from '@/lib/utils';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';

const money = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ChequeLedger() {
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterParty, setFilterParty] = useState('All');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);

    useEffect(() => {
        return onChequesUpdate(setCheques);
    }, []);

    const allPayments = useMemo(() => {
        const entries: any[] = [];
        cheques.forEach(c => {
            (c.splits || []).forEach(s => {
                (s.partialPayments || []).forEach(p => {
                    entries.push({
                        ...p,
                        payeeName: c.payeeName,
                        chequeNumber: s.chequeNumber,
                        voucherNo: c.voucherNo,
                        parentChequeId: c.id,
                        splitId: s.id
                    });
                });
            });
        });
        return entries;
    }, [cheques]);

    const filteredPayments = useMemo(() => {
        let filtered = [...allPayments];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => 
                (p.payeeName || '').toLowerCase().includes(q) ||
                (p.remarks || '').toLowerCase().includes(q) ||
                (p.chequeNumber || '').toLowerCase().includes(q) ||
                (p.voucherNo || '').toLowerCase().includes(q)
            );
        }

        if (filterParty !== 'All') {
            filtered = filtered.filter(p => p.payeeName === filterParty);
        }

        if (dateRange?.from) {
            const start = startOfDay(dateRange.from);
            const end = endOfDay(dateRange.to || dateRange.from);
            filtered = filtered.filter(p => {
                const pDate = new Date(p.date);
                return isWithinInterval(pDate, { start, end });
            });
        }

        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allPayments, searchQuery, filterParty, dateRange]);

    const paginated = filteredPayments.slice((currentPage - 1) * itemsPerPage, itemsPerPage === -1 ? undefined : currentPage * itemsPerPage);
    const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(filteredPayments.length / itemsPerPage);

    const uniqueParties = useMemo(() => {
        return Array.from(new Set(allPayments.map(p => p.payeeName))).sort();
    }, [allPayments]);

    const totalAmount = useMemo(() => filteredPayments.reduce((sum, p) => sum + p.amount, 0), [filteredPayments]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterParty('All');
        setDateRange(undefined);
    };

    return (
        <div className="space-y-4">
            <Card className="border-gray-100 shadow-sm overflow-hidden bg-white">
                <CardHeader className="bg-muted/20 border-b py-4 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-xl font-bold">Payment Ledger</CardTitle>
                        <CardDescription className="text-xs">Consolidated log of all cleared payments across issued cheques.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input 
                                placeholder="Search payments..." 
                                className="pl-8 h-9 text-xs w-[180px] bg-white border-gray-200"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={filterParty} onValueChange={setFilterParty}>
                            <SelectTrigger className="h-9 w-[150px] text-xs bg-white border-gray-200">
                                <div className="flex items-center gap-2">
                                    <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <SelectValue placeholder="All parties" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All parties</SelectItem>
                                {uniqueParties.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("h-9 w-[180px] justify-start text-left font-normal bg-white text-xs px-3 border-gray-200", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                    <span className="truncate">
                                        {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}` : format(dateRange.from, 'MMM d')) : 'Date Range'}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                            </PopoverContent>
                        </Popover>
                        {(searchQuery || filterParty !== 'All' || dateRange) && (
                            <Button variant="ghost" size="icon" onClick={handleClearFilters} className="h-9 w-9 text-muted-foreground" title="Clear Filters">
                                <FilterX className="h-4 w-4"/>
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table className="text-xs">
                        <TableHeader className="bg-muted/50 border-b">
                            <TableRow className="hover:bg-transparent h-10">
                                <TableHead className="pl-6 font-bold uppercase text-[10px]">Payment Date (BS)</TableHead>
                                <TableHead className="font-bold uppercase text-[10px]">Beneficiary / Payee</TableHead>
                                <TableHead className="font-bold uppercase text-[10px]">Reference (Cheque/Voucher)</TableHead>
                                <TableHead className="font-bold uppercase text-[10px]">Payment Note</TableHead>
                                <TableHead className="text-right pr-6 font-bold uppercase text-[10px]">Amount (NPR)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="bg-white">
                            {paginated.map(p => (
                                <TableRow key={p.id} className="h-12 border-b hover:bg-muted/10 transition-colors">
                                    <TableCell className="pl-6 text-muted-foreground font-mono">{toNepaliDate(p.date)}</TableCell>
                                    <TableCell className="font-black text-gray-900 uppercase tracking-tight">{p.payeeName}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-blue-600">Cheque: {p.chequeNumber || 'N/A'}</span>
                                            <span className="text-[9px] uppercase text-muted-foreground">Voucher: #{p.voucherNo}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="italic text-muted-foreground max-w-[200px] truncate" title={p.remarks}>{p.remarks || '—'}</TableCell>
                                    <TableCell className="text-right pr-6 font-black tabular-nums text-emerald-700 text-sm">Rs. {money(p.amount)}</TableCell>
                                </TableRow>
                            ))}
                            {filteredPayments.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-40 text-center text-muted-foreground italic">
                                        No payment history found matching these filters.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        {filteredPayments.length > 0 && (
                            <TableFooter className="bg-muted/40 font-black h-12 border-t-2">
                                <TableRow>
                                    <TableCell colSpan={4} className="text-right uppercase tracking-widest text-[10px]">Total Filtered Period Payments</TableCell>
                                    <TableCell className="text-right pr-6 text-base text-emerald-800 tabular-nums">Rs. {money(totalAmount)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                </CardContent>
                {totalPages > 1 && (
                    <CardFooter className="py-3 border-t bg-muted/5 flex justify-between items-center px-6">
                         <div className="text-[10px] font-bold text-muted-foreground uppercase">Page {currentPage} of {totalPages}</div>
                         <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4"/></Button>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4"/></Button>
                         </div>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}