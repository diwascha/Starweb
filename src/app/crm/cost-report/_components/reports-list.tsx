'use client';

import { useState, useEffect } from 'react';
import type { CostReport } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { onCostReportsUpdate } from '@/services/cost-report-service';
import { toNepaliDate } from '@/lib/utils';

interface SavedReportsListProps {
    onEdit: (r: CostReport) => void;
    onPreview: (r: CostReport) => void;
    onDelete: (id: string) => void;
}

export function SavedReportsList({ onEdit, onPreview, onDelete }: SavedReportsListProps) {
    const [reports, setReports] = useState<CostReport[]>([]);
    useEffect(() => onCostReportsUpdate(setReports), []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Saved Cost Reports</CardTitle>
                <CardDescription>Historical logs of manufacturing estimates and quotations.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Report #</TableHead>
                            <TableHead>Date (BS)</TableHead>
                            <TableHead>Party Name</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reports.map(r => (
                            <TableRow key={r.id}>
                                <TableCell className="font-mono">{r.reportNumber}</TableCell>
                                <TableCell>{toNepaliDate(r.reportDate)}</TableCell>
                                <TableCell>{r.partyName}</TableCell>
                                <TableCell className="text-right">
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
        </Card>
    );
}
