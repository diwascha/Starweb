'use client';

import { useState, useEffect, useMemo } from 'react';
import type { CostReport, Party, QuotationStatus } from '@/lib/types';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { onCostReportsUpdate, updateQuotationStatus, deleteCostReport } from '@/services/cost-report-service';
import { onPartiesUpdate } from '@/services/party-service';
import { toNepaliDate, cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';

interface SavedReportsListProps {
    onEdit: (r: CostReport) => void;
    onPreview: (r: CostReport) => void;
    onDelete: (id: string) => void;
}

export function SavedReportsList({ onEdit, onPreview, onDelete }: SavedReportsListProps) {
    const [reports, setReports] = useState<CostReport[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const { user } = useAuth();
    
    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPartyId, setFilterPartyId] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
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

        if (filterStatus !== 'All') {
            filtered = filtered.filter(r => r.status === filterStatus);
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
    }, [reports, searchQuery, filterPartyId, filterStatus, dateRange]);

    const paginated = filteredReports.slice((currentPage - 1) * itemsPerPage, itemsPerPage === -1 ? undefined : currentPage * itemsPerPage);
    const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(filteredReports.length / itemsPerPage);

    const isFiltered = filterPartyId !== 'All' || filterStatus !== 'All' || !!dateRange || searchQuery !== '';

    const getStatusBadge = (status: QuotationStatus) => {
        const variants: Record<QuotationStatus, string> = {
            'Draft': 'bg-gray-100 text-gray-700 border-gray-200',
            'Sent': 'bg-blue-50 text-blue-700 border-blue-200',
            'Accepted': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Rejected': 'bg-red-50 text-red-700 border-red-200',
            'Expired': 'bg-amber-50 text-amber-700 border-amber-200'
        };
        return (
            <Badge variant="outline" className={cn("text-[8px] font-black uppercase tracking-widest px-1.5 h-4 shadow-none", variants[status || 'Draft'])}>
                {status || 'Draft'}
            </Badge>
        );
    };

    return (
        <Card>
            <CardHeader className="py-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg font-bold">Estimate & Quotation Registry</CardTitle>
                        <CardDescription className="text-xs">Consolidated historical logs of manufacturing estimates.</CardDescription>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search ref or client..."
                                className="pl-8 h-8 text-xs w-[180px] bg-white border-gray-200"
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            />
                        </div>

                        <Select value={filterPartyId} onValueChange={(v) => { setFilterPartyId(v); setCurrentPage(1); }}>
                            <SelectTrigger className="h-8 w-[150px] bg-white text-xs border-gray-200">
                                <SelectValue placeholder="All Clients" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Clients</SelectItem>
                                {uniqueParties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}>
                            <SelectTrigger className="h-8 w-[120px] bg-white text-xs border-gray-200">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Status</SelectItem>
                                <SelectItem value="Draft">Draft</SelectItem>
                                <SelectItem value="Sent">Sent</SelectItem>
                                <SelectItem value="Accepted">Accepted</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
                                <SelectItem value="Expired">Expired</SelectItem>
                            </SelectContent>
                        </Select>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("h-8 w-[180px] justify-start text-left font-normal bg-white text-xs px-2 border-gray-200", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                                    <span className="truncate">
                                        {dateRange?.from ? (
                                            dateRange.to ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}` : format(dateRange.from, "MMM d")
                                        ) : 'Date Range'}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <DualDateRangePicker selected={dateRange} onSelect={(range) => { setDateRange(range); setCurrentPage(1); }} />
                            </PopoverContent>
                        </Popover>

                        {isFiltered && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => { setFilterPartyId('All'); setFilterStatus('All'); setDateRange(undefined); setSearchQuery(''); setCurrentPage(1); }} 
                                className="h-8 px-2 text-[10px] font-bold uppercase tracking-tight text-muted-foreground hover:text-foreground"
                            >
                                <FilterX className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent h-10">
                            <TableHead className="pl-6 font-bold uppercase text-[9px] tracking-widest">Ref #</TableHead>
                            <TableHead className="font-bold uppercase text-[9px] tracking-widest">Date (BS)</TableHead>
                            <TableHead className="font-bold uppercase text-[9px] tracking-widest">Client Name</TableHead>
                            <TableHead className="text-center font-bold uppercase text-[9px] tracking-widest">Status</TableHead>
                            <TableHead className="text-right pr-6 font-bold uppercase text-[9px] tracking-widest">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginated.map(r => (
                            <TableRow key={r.id} className="h-14 hover:bg-muted/30 transition-colors">
                                <TableCell className="font-mono pl-6 text-blue-700 font-bold">{r.reportNumber}</TableCell>
                                <TableCell className="text-xs text-gray-500">{toNepaliDate(r.reportDate)}</TableCell>
                                <TableCell className="font-bold text-gray-900">{r.partyName}</TableCell>
                                <TableCell className="text-center">{getStatusBadge(r.status || 'Draft')}</TableCell>
                                <TableCell className="text-right pr-6">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuItem onSelect={() => onPreview(r)}><Eye className="mr-2 h-4 w-4"/> View / Print Quotation</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => onEdit(r)}><Edit className="mr-2 h-4 w-4"/> Edit Specs</DropdownMenuItem>
                                            
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel className="text-[9px] uppercase font-black px-2 py-1 text-muted-foreground">Lifecycle State</DropdownMenuLabel>
                                            {(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'] as QuotationStatus[]).filter(s => s !== r.status).map(s => (
                                                <DropdownMenuItem key={s} onSelect={() => updateQuotationStatus(r.id, s, user?.username || 'Admin')}>{s}</DropdownMenuItem>
                                            ))}

                                            <DropdownMenuSeparator />
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4 text-destructive"/> Delete Record</DropdownMenuItem>
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
                        {filteredReports.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic text-xs uppercase font-black opacity-30">No records found matching criteria.</TableCell></TableRow>}
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
