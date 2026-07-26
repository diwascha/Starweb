
'use client';

import { useState, useMemo } from 'react';
import type { GsmReport } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Printer, Trash2, Eye, Search, FilterX, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { toNepaliDate, generateId } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { deleteGsmReport } from '@/services/gsm-service';

export function GsmReportsList({ reports, onPrint }: { reports: GsmReport[], onPrint: (r: GsmReport) => void }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return reports.filter(r => 
            r.voucherNo.toLowerCase().includes(q) || 
            r.vendorName.toLowerCase().includes(q) ||
            (r.entries || []).some(e => (e.reelNumber || '').toLowerCase().includes(q))
        );
    }, [reports, searchQuery]);

    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    return (
        <Card className="shadow-sm border-gray-100 bg-white">
            <CardHeader className="py-4 border-b bg-muted/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-sm font-black uppercase">Report History</CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Historical log of paper quality verifications.</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input 
                        placeholder="Search logs..." 
                        className="pl-8 h-8 text-xs bg-white" 
                        value={searchQuery} 
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} 
                    />
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table className="text-xs">
                    <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="pl-6 font-bold uppercase">Date (BS)</TableHead>
                            <TableHead className="font-bold uppercase">Report #</TableHead>
                            <TableHead className="font-bold uppercase">Supplier</TableHead>
                            <TableHead className="font-bold uppercase text-center">Entries</TableHead>
                            <TableHead className="text-right font-bold uppercase">Avg Result (GSM)</TableHead>
                            <TableHead className="text-right pr-6 font-bold uppercase">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginated.map(r => (
                            <TableRow key={r.id} className="h-12 border-b hover:bg-muted/10">
                                <TableCell className="pl-6 font-mono">{toNepaliDate(r.date)}</TableCell>
                                <TableCell className="font-bold text-blue-700">{r.voucherNo}</TableCell>
                                <TableCell className="font-black text-gray-900 uppercase tracking-tighter">{r.vendorName}</TableCell>
                                <TableCell className="text-center font-bold text-muted-foreground">{(r.entries || []).length} Reels</TableCell>
                                <TableCell className="text-right"><Badge variant="outline" className="font-black tabular-nums bg-gray-50">{r.avgGsm.toFixed(2)}</Badge></TableCell>
                                <TableCell className="text-right pr-6">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => onPrint(r)}><Printer className="mr-2 h-4 w-4" /> View / Print</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete Record</DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader><AlertDialogTitle>Delete this report?</AlertDialogTitle><AlertDialogDescription>This action is permanent and will remove the verification log for {r.voucherNo}.</AlertDialogDescription></AlertDialogHeader>
                                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteGsmReport(r.id)} className="bg-destructive text-white">Delete Permanent</AlertDialogAction></AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">No reports found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
            {totalPages > 1 && (
                <CardFooter className="py-3 border-t bg-muted/5 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Page {currentPage} of {totalPages}</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4"/></Button>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4"/></Button>
                    </div>
                </CardFooter>
            )}
        </Card>
    );
}
