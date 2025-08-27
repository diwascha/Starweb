'use client';

import { useEffect, useState } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function ReportView({ reportId }: { reportId: string }) {
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const foundReport = reports.find(r => r.id === reportId);
    setReport(foundReport || null);
  }, [reportId, reports]);

  const handlePrint = () => {
    if (report) {
      const newLogEntry = { date: new Date().toISOString() };
      const updatedReport = {
          ...report,
          printLog: [...(report.printLog || []), newLogEntry],
      };
      setReports(reports.map(r => r.id === reportId ? updatedReport : r));
      setReport(updatedReport); 
    }
    
    // We need to wait for state to update before printing
    setTimeout(() => {
      window.print();
    }, 100);
  };

  if (!report) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Report not found or is loading...</p>
      </div>
    );
  }
  
  const formatLabel = (key: string) => {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <h1 className="text-3xl font-bold">Test Report</h1>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print or Save as PDF
        </Button>
      </div>

      <div className="printable-area space-y-8 p-4 border rounded-lg">
        <header className="text-center space-y-2 mb-8">
            <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <p className="text-muted-foreground">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            <h2 className="text-xl font-semibold underline">TEST REPORT</h2>
        </header>
        
        <div className="flex justify-between text-sm mb-4">
            <div>
                <span className="font-semibold">Serial No:</span> {report.serialNumber}
            </div>
            <div>
                <span className="font-semibold">Date:</span> {new Date(report.date).toLocaleDateString()}
            </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Product Test Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
             <section>
                <h2 className="text-xl font-semibold mb-2">Product Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="font-medium text-muted-foreground">Product Name: </span>
                        <span>{report.product.name}</span>
                    </div>
                    <div>
                        <span className="font-medium text-muted-foreground">Material Code: </span>
                        <span>{report.product.materialCode}</span>
                    </div>
                     <div>
                        <span className="font-medium text-muted-foreground">Delivered To: </span>
                        <span>{report.product.companyName}</span>
                    </div>
                    <div>
                        <span className="font-medium text-muted-foreground">Address: </span>
                        <span>{report.product.address}</span>
                    </div>
                </div>
            </section>
            <Separator />
            <section>
              <h2 className="text-xl font-semibold mb-2">Test Parameters & Results</h2>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Standard</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.keys(report.product.specification).map((key) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">
                          {formatLabel(key)}
                        </TableCell>
                        <TableCell>{report.product.specification[key as keyof typeof report.product.specification]}</TableCell>
                        <TableCell>{report.testData[key as keyof typeof report.testData]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </CardContent>
        </Card>
        
        {report.printLog && report.printLog.length > 0 && (
           <Card className="print:hidden">
             <CardHeader>
               <CardTitle>Print History</CardTitle>
               <CardDescription>This report has been printed {report.printLog.length} time(s).</CardDescription>
             </CardHeader>
             <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Print #</TableHead>
                            <TableHead>Date & Time</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {report.printLog.map((log, index) => (
                            <TableRow key={index}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{new Date(log.date).toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
             </CardContent>
           </Card>
        )}
      </div>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-area,
          .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 2rem;
            border: none;
          }
           .printable-area .shadow-lg, .printable-area .shadow-sm {
            box-shadow: none !important;
          }
           .printable-area .border {
            border: 1px solid #ccc !important;
          }
        }
      `}</style>
    </>
  );
}
