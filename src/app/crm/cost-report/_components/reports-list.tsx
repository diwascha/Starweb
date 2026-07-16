'use client';

import { useState, useEffect, useMemo } from 'react';
import type { CostReport } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Eye, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { onCostReportsUpdate } from '@/services/cost-report-service';
import { toNepaliDate } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SavedReportsListProps {
    onEdit: (r: CostReport) => void;
    onPreview: (r: CostReport) => void;
    onDelete: (id: string) => void;
}

export function SavedReportsList({ onEdit, onPreview, onDelete }: SavedReportsListProps) {
    const [reports, setReports] = useState<CostReport[]>([]);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    useEffect(() => onCostReportsUpdate(setReports), []);

    const paginated = useMemo(() => {
        if (itemsPerPage === -1) return reports;
        const start = (currentPage - 1) * itemsPerPage;
        return reports.slice(start, start + itemsPerPage);
    }, [reports, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.ceil(reports.length / itemsPerPage);
    }, [reports, itemsPerPage]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Saved Cost Reports</CardTitle>
                <CardDescription>Historical logs of manufacturing estimates and quotations.</CardDescription>
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
                        {reports.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No reports found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{reports.length}</span> reports</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, reports.length)}</span> of <span className="font-bold text-foreground">{reports.length}</span> reports
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
