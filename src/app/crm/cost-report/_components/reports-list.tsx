'use client';

import { useState, useEffect, useMemo } from 'react';
import type { CostReport, Party } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
    MoreHorizontal, 
    Eye, 
    Edit, 
    Trash2, 
    ChevronLeft, 
    ChevronRight, 
    Search, 
    FilterX, 
    Users, 
    CalendarIcon 
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { onCostReportsUpdate } from '@/services/cost-report-service';
import { onPartiesUpdate } from '@/services/party-service';
import { toNepaliDate, cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

interface SavedReportsListProps {
    onEdit: (r: CostReport) => void;
    onPreview: (r: CostReport) => void;
    onDelete: (id: string) => void;
}

export function SavedReportsList({ onEdit, onPreview, onDelete }: SavedReportsListProps) {
    const [reports, setReports] = useState<CostReport[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    
    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPartyId, setFilterPartyId] = useState('All');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    useEffect(() => {
        const unsubReports = onCostReportsUpdate(setReports);
        const unsubParties = onPartiesUpdate(setParties);
        return () => {
            unsubReports();
            unsubParties();
        };
    }, []);

    const uniqueParties = useMemo(() => {
        const pIds = new Set(reports.map(r => r.partyId));
        return parties.filter(p => pIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
    }, [reports, parties]);

    const filteredReports = useMemo(() => {
        let filtered = [...reports];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(r => 
                r.reportNumber.toLowerCase().includes(q) || 
                r.partyName.toLowerCase().includes(q)
            );
        }

        if (filterPartyId !== 'All') {
            filtered = filtered.filter(r => r.partyId === filterPartyId);
        }

        if (dateRange?.from) {
            const start = startOfDay(dateRange.from);
            const end = endOfDay(dateRange.to || dateRange.from);
            filtered = filtered.filter(r => {
                const reportDate = new Date(r.reportDate);
                return isWithinInterval(reportDate, { start, end });
            });
        }

        return filtered;
    }, [reports, searchQuery, filterPartyId, dateRange]);

    const paginated = useMemo(() => {
        if (itemsPerPage === -1) return filteredReports;
        const start = (currentPage - 1) * itemsPerPage;
        return filteredReports.slice(start, start + itemsPerPage);
    }, [filteredReports, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.ceil(filteredReports.length / itemsPerPage);
    }, [filteredReports, itemsPerPage]);

    const isFiltered = filterPartyId !== 'All' || !!dateRange || searchQuery !== '';

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <CardTitle>Saved Cost Reports</CardTitle>
                            <CardDescription>Historical logs of manufacturing estimates and quotations.</CardDescription>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search report # or party..."
                                className="pl-8 h-9 text-xs w-full sm:w-[250px]"
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-dashed">
                        <div className="space-y-1.5 flex-1 min-w-[160px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Filter by Party</Label>
                            <Select value={filterPartyId} onValueChange={(v) => { setFilterPartyId(v); setCurrentPage(1); }}>
                                <SelectTrigger className="h-9 bg-white text-xs">
                                    <div className="flex items-center gap-2">
                                        <Users className="h-3 w-3 text-muted-foreground" />
                                        <SelectValue placeholder="All Parties" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Parties</SelectItem>
                                    {uniqueParties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5 flex-1 min-w-[200px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Date Range (AD)</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs px-3", !dateRange && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                        <span className="truncate">
                                            {dateRange?.from ? (
                                                dateRange.to ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}` : format(dateRange.from, "MMM d")
                                            ) : 'Pick date range'}
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualDateRangePicker selected={dateRange} onSelect={(range) => { setDateRange(range); setCurrentPage(1); }} />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {isFiltered && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => { setFilterPartyId('All'); setDateRange(undefined); setSearchQuery(''); setCurrentPage(1); }} 
                                className="h-9 px-2 text-[10px] font-bold uppercase tracking-tight text-muted-foreground hover:text-foreground"
                            >
                                <FilterX className="mr-1.5 h-3.5 w-3.5" /> Reset
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="pl-6 font-bold uppercase text-[11px]">Report #</TableHead>
                            <TableHead className="font-bold uppercase text-[11px]">Date (BS)</TableHead>
                            <TableHead className="font-bold uppercase text-[11px]">Party Name</TableHead>
                            <TableHead className="text-right pr-6 font-bold uppercase text-[11px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginated.map(r => (
                            <TableRow key={r.id}>
                                <TableCell className="font-mono pl-6">{r.reportNumber}</TableCell>
                                <TableCell>{toNepaliDate(r.reportDate)}</TableCell>
                                <TableCell>{r.partyName}</TableCell>
                                <TableCell className="text-right pr-6">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => onPreview(r)}><Eye className="mr-2 h-4 w-4"/> View / Print</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => onEdit(r)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4 text-destructive"/> Delete</DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                                                        <AlertDialogDescription>This action is permanent and will remove the record from history.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => onDelete(r.id)}>Confirm Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredReports.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No reports found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filteredReports.length}</span> reports</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredReports.length)}</span> of <span className="font-bold text-foreground">{filteredReports.length}</span> reports
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                            <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                setItemsPerPage(parseInt(v));
                                setCurrentPage(1);
                            }}>
                                <SelectTrigger className="h-8 w-[70px] bg-white border-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="-1">All</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {itemsPerPage !== -1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs font-bold px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardFooter>
            )}
        </Card>
    );
}
