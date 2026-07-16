'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PlusCircle, FileText, MoreHorizontal, Trash2, View, Printer, ArrowUpDown, Search, Edit, User, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Report } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { onReportsUpdate, deleteReport, updateReport } from '@/services/report-service';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type ReportSortKey = 'serialNumber' | 'productName' | 'taxInvoiceNumber' | 'challanNumber' | 'quantity' | 'authorship';
type SortDirection = 'asc' | 'desc';

export default function ReportsListPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [reportSortConfig, setReportSortConfig] = useState<{ key: ReportSortKey; direction: SortDirection }>({
    key: 'serialNumber',
    direction: 'desc',
  });

  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { hasPermission } = useAuth();

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = onReportsUpdate((reportsData) => {
        setReports(reportsData);
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);
  
  const handleDeleteReport = async (id: string) => {
    try {
      await deleteReport(id);
      toast({ title: 'Report Deleted', description: 'The report has been successfully deleted.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete report.', variant: 'destructive' });
    }
  };
  
  const handlePrint = async (report: Report) => {
    const newLogEntry = { date: new Date().toISOString() };
    const updatedPrintLog = [...(report.printLog || []), newLogEntry];
    
    try {
      await updateReport(report.id, { printLog: updatedPrintLog });
      
      setTimeout(() => {
          const printWindow = window.open(`/report?id=${report.id}`, '_blank');
          if (printWindow) {
              printWindow.onload = () => {
                  setTimeout(() => printWindow.print(), 500);
              };
          }
      }, 100);
    } catch (error) {
      toast({ title: 'Error', description: 'Could not update print log.', variant: 'destructive' });
    }
  };

  const requestReportSort = (key: ReportSortKey) => {
    let direction: SortDirection = 'asc';
    if (reportSortConfig.key === key && reportSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setReportSortConfig({ key, direction });
  };
  
  const filteredAndSortedReports = useMemo(() => {
    let filteredReports = [...reports];

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filteredReports = filteredReports.filter(report =>
            (report.serialNumber || '').toLowerCase().includes(lowercasedQuery) ||
            (report.product?.name || '').toLowerCase().includes(lowercasedQuery) ||
            (report.taxInvoiceNumber || '').toLowerCase().includes(lowercasedQuery) ||
            (report.challanNumber || '').toLowerCase().includes(lowercasedQuery)
        );
    }
    
    if (reportSortConfig.key) {
      filteredReports.sort((a, b) => {
        if (reportSortConfig.key === 'authorship') {
             const aDate = a.lastModifiedAt || a.createdAt;
             const bDate = b.lastModifiedAt || b.createdAt;
             if (!aDate || !bDate) return 0;
             if (aDate < bDate) return reportSortConfig.direction === 'asc' ? -1 : 1;
             if (aDate > bDate) return reportSortConfig.direction === 'asc' ? 1 : -1;
             return 0;
        }

        let aValue: string | number;
        let bValue: string | number;
  
        switch (reportSortConfig.key) {
          case 'productName':
            aValue = a.product.name.toLowerCase();
            bValue = b.product.name.toLowerCase();
            break;
          case 'taxInvoiceNumber':
            aValue = a.taxInvoiceNumber.toLowerCase();
            bValue = b.taxInvoiceNumber.toLowerCase();
            break;
          case 'challanNumber':
            aValue = a.challanNumber.toLowerCase();
            bValue = b.challanNumber.toLowerCase();
            break;
          case 'quantity':
            aValue = a.quantity.toLowerCase();
            bValue = b.quantity.toLowerCase();
            break;
          case 'serialNumber':
          default:
            aValue = parseInt((a.serialNumber || '0').split('-')[1] || '0', 10);
            bValue = parseInt((b.serialNumber || '0').split('-')[1] || '0', 10);
            break;
        }
  
        if (aValue < bValue) {
          return reportSortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return reportSortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return filteredReports;
  }, [reports, reportSortConfig, searchQuery]);

  const paginatedReports = useMemo(() => {
    if (itemsPerPage === -1) return filteredAndSortedReports;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedReports.slice(start, start + itemsPerPage);
  }, [filteredAndSortedReports, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(filteredAndSortedReports.length / itemsPerPage);
  }, [filteredAndSortedReports, itemsPerPage]);


  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
          </div>
        </div>
      );
    }

    if (reports.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-2xl font-bold tracking-tight">No reports yet</h3>
              <p className="text-sm text-muted-foreground">Get started by creating a new report.</p>
              {hasPermission('reports', 'create') && (
                <Button className="mt-4" asChild>
                    <Link href="/report/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> New QT Reports
                    </Link>
                </Button>
              )}
            </div>
          </div>
        );
      }

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestReportSort('serialNumber')} className="text-xs">
                        Test Serial No.
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestReportSort('productName')} className="text-xs">
                        Product
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestReportSort('taxInvoiceNumber')} className="text-xs">
                        Invoice Number
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestReportSort('challanNumber')} className="text-xs">
                        Challan Number
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestReportSort('quantity')} className="text-xs">
                        Quantities
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestReportSort('authorship')} className="text-xs">
                            Authorship
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead className="text-right pr-6 text-xs">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedReports.map(report => (
                    <TableRow key={report.id} className="h-14">
                        <TableCell className="font-medium">{report.serialNumber}</TableCell>
                        <TableCell>{report.product.name}</TableCell>
                        <TableCell>{report.taxInvoiceNumber}</TableCell>
                        <TableCell>{report.challanNumber}</TableCell>
                        <TableCell>{report.quantity}</TableCell>
                        <TableCell>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                        {report.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                        <span>{report.lastModifiedBy || report.createdBy}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>
                                            Created by: {report.createdBy}
                                            {report.createdAt ? ` on ${format(new Date(report.createdAt), "PP")}` : ''}
                                        </p>
                                        {report.lastModifiedBy && report.lastModifiedAt && (
                                          <p>
                                            Modified by: {report.lastModifiedBy}
                                            {report.lastModifiedAt ? ` on ${format(new Date(report.lastModifiedAt), "PP")}` : ''}
                                          </p>
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            {hasPermission('reports', 'view') && (
                               <DropdownMenuItem onSelect={() => router.push(`/report?id=${report.id}`)}>
                                    <View className="mr-2 h-4 w-4" /> View
                                </DropdownMenuItem>
                            )}
                            {hasPermission('reports', 'edit') && (
                               <DropdownMenuItem onSelect={() => router.push(`/report/edit?id=${report.id}`)}>
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                            )}
                            {hasPermission('reports', 'view') && (
                                <DropdownMenuItem onSelect={() => handlePrint(report)}>
                                    <Printer className="mr-2 h-4 w-4" /> Print
                                </DropdownMenuItem>
                            )}
                            {(hasPermission('reports', 'view') || hasPermission('reports', 'edit')) && hasPermission('reports', 'delete') && <DropdownMenuSeparator />}
                            {hasPermission('reports', 'delete') && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                        <span className="text-destructive">Delete</span>
                                    </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete the report.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteReport(report.id)}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </CardContent>
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filteredAndSortedReports.length}</span> reports</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredAndSortedReports.length)}</span> of <span className="font-bold text-foreground">{filteredAndSortedReports.length}</span> reports
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
  };
  
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">QT Reports Database</h1>
            <p className="text-muted-foreground">View and manage your test reports.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search reports..."
                    className="pl-8 sm:w-[250px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          {hasPermission('reports', 'create') && (
            <Button asChild>
                <Link href="/report/new">
                <PlusCircle className="mr-2 h-4 w-4" /> New QT Reports
                </Link>
            </Button>
          )}
        </div>
      </header>
      {renderContent()}
    </div>
  );
}
