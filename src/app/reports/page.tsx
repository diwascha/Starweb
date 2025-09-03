
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PlusCircle, FileText, MoreHorizontal, Edit, Trash2, View, Printer, ArrowUpDown } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report, Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useRouter } from 'next/navigation';

type ReportSortKey = 'serialNumber' | 'productName' | 'taxInvoiceNumber' | 'challanNumber' | 'quantity';
type SortDirection = 'asc' | 'desc';

export default function ReportsPage() {
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const [products] = useLocalStorage<Product[]>('products', []);
  
  const [reportSortConfig, setReportSortConfig] = useState<{ key: ReportSortKey; direction: SortDirection }>({
    key: 'serialNumber',
    direction: 'desc',
  });

  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const deleteReport = (id: string) => {
    setReports(reports.filter(report => report.id !== id));
    toast({ title: 'Report Deleted', description: 'The report has been successfully deleted.' });
  };
  
  const handlePrint = (report: Report) => {
    const newLogEntry = { date: new Date().toISOString() };
    const updatedReport = {
      ...report,
      printLog: [...(report.printLog || []), newLogEntry],
    };
    
    const updatedReports = reports.map(r => r.id === report.id ? updatedReport : r);
    setReports(updatedReports);
    
    setTimeout(() => {
        const printWindow = window.open(`/report/${report.id}`, '_blank');
        if (printWindow) {
            printWindow.onload = () => {
                printWindow.print();
            };
        }
    }, 100);
  };

  const requestReportSort = (key: ReportSortKey) => {
    let direction: SortDirection = 'asc';
    if (reportSortConfig.key === key && reportSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setReportSortConfig({ key, direction });
  };
  
  const sortedReports = useMemo(() => {
    const sortableReports = [...reports];
    if (reportSortConfig.key) {
      sortableReports.sort((a, b) => {
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
    return sortableReports;
  }, [reports, reportSortConfig]);


  const renderContent = () => {
    if (!isClient) {
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
              <Button className="mt-4" asChild>
                <Link href="/report/new">
                  <PlusCircle className="mr-2 h-4 w-4" /> New Report
                </Link>
              </Button>
            </div>
          </div>
        );
      }

    return (
        <Card>
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestReportSort('serialNumber')}>
                    Test Serial No.
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestReportSort('productName')}>
                    Product
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestReportSort('taxInvoiceNumber')}>
                    Invoice Number
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestReportSort('challanNumber')}>
                    Challan Number
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestReportSort('quantity')}>
                    Quantities
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {sortedReports.map(report => (
                <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.serialNumber}</TableCell>
                    <TableCell>{report.product.name}</TableCell>
                    <TableCell>{report.taxInvoiceNumber}</TableCell>
                    <TableCell>{report.challanNumber}</TableCell>
                    <TableCell>{report.quantity}</TableCell>
                    <TableCell className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/report/${report.id}`)}>
                            <View className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(`/report/edit/${report.id}`)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handlePrint(report)}>
                            <Printer className="mr-2 h-4 w-4" /> Print
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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
                                <AlertDialogAction onClick={() => deleteReport(report.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        </DropdownMenuContent>
                    </DropdownMenu>
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
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Image src="/logo.png" alt="Company Logo" width={80} height={80} />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports Dashboard</h1>
            <p className="text-muted-foreground">View and manage your test reports.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/report/new">
              <PlusCircle className="mr-2 h-4 w-4" /> New Report
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {renderContent()}
      </div>
    </div>
  );
}
