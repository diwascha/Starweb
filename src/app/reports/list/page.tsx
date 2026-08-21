'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
    FileText, 
    Search, 
    MoreHorizontal, 
    Printer, 
    Edit, 
    Trash2, 
    ArrowUpDown, 
    Eye, 
    Loader2, 
    FilterX,
    ChevronLeft,
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import type { Report } from '@/lib/types';
import { onReportsUpdate, deleteReport } from '@/services/report-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger, 
    DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { cn, toNepaliDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type SortKey = 'serialNumber' | 'date' | 'productName' | 'quantity' | 'taxInvoiceNumber';
type SortDirection = 'asc' | 'desc';

export default function ReportsListPage() {
    const [reports, setReports] = useState<Report[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const { toast } = useToast();
    const router = useRouter();
    const { hasPermission } = useAuth();

    useEffect(() => {
        setIsLoading(true);
        const unsub = onReportsUpdate((data) => {
            setReports(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const filteredAndSortedReports = useMemo(() => {
        let filtered = [...reports];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(r => 
                r.serialNumber.toLowerCase().includes(q) ||
                (r.product?.name || '').toLowerCase().includes(q) ||
                (r.taxInvoiceNumber || '').toLowerCase().includes(q)
            );
        }

        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            switch (sortConfig.key) {
                case 'productName':
                    aVal = a.product?.name || '';
                    bVal = b.product?.name || '';
                    break;
                case 'quantity':
                    aVal = parseFloat(a.quantity) || 0;
                    bVal = parseFloat(b.quantity) || 0;
                    break;
                default:
                    aVal = a[sortConfig.key] || '';
                    bVal = b[sortConfig.key] || '';
            }

            if (aVal < bVal) return -1 * dir;
            if (aVal > bVal) return 1 * dir;
            return 0;
        });

        return filtered;
    }, [reports, searchQuery, sortConfig]);

    const paginatedReports = filteredAndSortedReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filteredAndSortedReports.length / itemsPerPage);

    const handleDelete = async (id: string) => {
        try {
            await deleteReport(id);
            toast({ title: 'Report Deleted', description: 'Record removed from history.' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const sortButton = (key: SortKey, label: string) => (
        <Button variant="ghost" onClick={() => requestSort(key)} className="h-8 px-2 text-[10px] font-black uppercase tracking-widest hover:bg-transparent">
            {label}
            <ArrowUpDown className={cn("ml-1.5 h-3 w-3", sortConfig.key === key ? "text-primary opacity-100" : "opacity-30")} />
        </Button>
    );

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/reports')} className="h-10 w-10 border shadow-sm">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">QT Database</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Complete registry of manufacturing test reports.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter reports..." 
                            className="pl-8 w-full md:w-[250px] h-9 bg-white" 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                        />
                    </div>
                    {hasPermission('reports', 'create') && (
                        <Button size="sm" asChild>
                            <Link href="/report/new"><PlusCircle className="mr-2 h-4 w-4" /> New QT Report</Link>
                        </Button>
                    )}
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table className="text-xs">
                        <TableHeader className="bg-muted/50 border-b">
                            <TableRow className="hover:bg-transparent h-11">
                                <TableHead className="pl-6">{sortButton('serialNumber', 'S.N.')}</TableHead>
                                <TableHead>{sortButton('date', 'Date (BS)')}</TableHead>
                                <TableHead>{sortButton('productName', 'Product / Material')}</TableHead>
                                <TableHead>{sortButton('taxInvoiceNumber', 'Invoice #')}</TableHead>
                                <TableHead className="text-right">{sortButton('quantity', 'Qty')}</TableHead>
                                <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20" /></TableCell></TableRow>
                            ) : paginatedReports.map(report => (
                                <TableRow key={report.id} className="h-14 hover:bg-muted/10 transition-colors group">
                                    <TableCell className="pl-6 font-black text-blue-700 uppercase tabular-nums tracking-tighter">{report.serialNumber}</TableCell>
                                    <TableCell className="text-gray-500 font-medium">{toNepaliDate(report.date)}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-900 uppercase">{report.product?.name || 'Custom Product'}</span>
                                            <span className="text-[9px] text-muted-foreground uppercase font-black">{report.product?.materialCode || 'No Code'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono">{report.taxInvoiceNumber || '—'}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums">{report.quantity}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                                                <Link href={`/report/${report.id}`}><Eye className="h-4 w-4"/></Link>
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem onSelect={() => router.push(`/report/${report.id}`)}><FileText className="mr-2 h-4 w-4"/> View Report</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => window.open(`/report/${report.id}?print=true`, '_blank')}><Printer className="mr-2 h-4 w-4"/> Print Document</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete Record</DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle className="font-black uppercase tracking-tight">Delete Report?</AlertDialogTitle>
                                                                <AlertDialogDescription>This will permanently remove report #{report.serialNumber} from the database. This action is irreversible.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel className="font-bold text-xs uppercase h-10">Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDelete(report.id)} className="bg-destructive text-white font-black text-xs uppercase h-10 shadow-lg">Delete Record</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && filteredAndSortedReports.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="h-60 text-center text-muted-foreground italic uppercase font-black text-[10px] tracking-widest opacity-20">No matching reports found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                {totalPages > 1 && (
                    <CardFooter className="py-3 border-t bg-muted/5 flex justify-between items-center px-6">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Page {currentPage} of {totalPages}</span>
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
