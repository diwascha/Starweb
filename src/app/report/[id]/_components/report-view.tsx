
'use client';

import { useEffect, useState } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report, ProductSpecification } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';
import Image from 'next/image';

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
      
      const updatedReports = reports.map(r => r.id === reportId ? updatedReport : r);
      setReports(updatedReports);
      setReport(updatedReport); 
      
      setTimeout(() => {
        window.print();
      }, 0);
    }
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

  const nepaliDate = new NepaliDate(new Date(report.date));
  const nepaliDateString = nepaliDate.format('YYYY/MM/DD');

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <h1 className="text-3xl font-bold">Test Report</h1>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print or Save as PDF
        </Button>
      </div>

      <div className="printable-area space-y-8 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-2 mb-8 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2">
              <Image src="/logo.png" alt="Company Logo" width={100} height={100} />
            </div>
            <div className="pt-28">
              <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
              <p>HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
              <h2 className="text-xl font-semibold underline mt-2">TEST REPORT</h2>
            </div>
        </header>
        
        <div className="grid grid-cols-2 text-sm mb-4 gap-x-4 gap-y-2">
            <div><span className="font-semibold">Test Serial No:</span> {report.serialNumber}</div>
            <div className="text-right"><span className="font-semibold">Date:</span> {nepaliDateString} B.S. ({new Date(report.date).toLocaleDateString('en-CA')})</div>
            <div><span className="font-semibold">Tax Invoice No:</span> {report.taxInvoiceNumber}</div>
            <div className="text-right"><span className="font-semibold">Challan No:</span> {report.challanNumber}</div>
        </div>
        
        <Separator className="my-4 bg-gray-300"/>

        <Card className="shadow-none border-gray-300">
          <CardHeader>
            <CardTitle>Product Test Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
             <section>
                <h2 className="text-xl font-semibold mb-2">Product Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="font-medium">Product Name: </span>
                        <span>{report.product.name}</span>
                    </div>
                    <div>
                        <span className="font-medium">Material Code: </span>
                        <span>{report.product.materialCode}</span>
                    </div>
                     <div>
                        <span className="font-medium">Delivered To: </span>
                        <span>{report.product.companyName}</span>
                    </div>
                    <div>
                        <span className="font-medium">Address: </span>
                        <span>{report.product.address}</span>
                    </div>
                </div>
            </section>
            <Separator className="bg-gray-300"/>
            <section>
              <h2 className="text-xl font-semibold mb-2">Test Parameters & Results</h2>
              <div className="border rounded-lg border-gray-300">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-gray-300">
                      <TableHead className="text-black font-semibold">Parameter</TableHead>
                      <TableHead className="text-black font-semibold">Standard</TableHead>
                      <TableHead className="text-black font-semibold">Result</TableHead>
                      <TableHead className="text-black font-semibold">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.keys(report.product.specification).map((key) => {
                      const specKey = key as keyof ProductSpecification;
                      const standardValue = report.product.specification[specKey];
                      const testResult = report.testData[specKey];
                      
                      const resultValue = typeof testResult === 'object' && testResult !== null ? testResult.value : testResult;
                      const remarkValue = typeof testResult === 'object' && testResult !== null ? testResult.remark : '';
                      
                      let displayStandard = standardValue;
                      let displayResult = resultValue;
                      
                      if (specKey === 'gsm') {
                        displayStandard = `${standardValue} G/M2`;
                        displayResult = `${resultValue} G/M2`;
                      } else if (specKey === 'moisture') {
                        displayStandard = `${standardValue} %`;
                        displayResult = `${resultValue} %`;
                      } else if (specKey === 'load') {
                        displayStandard = `${standardValue} KGF`;
                        displayResult = `${resultValue} KGF`;
                      }
                      
                      return (
                        <TableRow key={key} className="border-b-gray-300">
                          <TableCell className="font-medium">
                            {formatLabel(key)}
                          </TableCell>
                          <TableCell>{displayStandard}</TableCell>
                          <TableCell>{displayResult}</TableCell>
                          <TableCell>{remarkValue}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
            <div className="mt-16 grid grid-cols-2 gap-8 pt-12 text-sm">
              <div className="text-center">
                <div className="border-t border-black w-48 mx-auto"></div>
                <p className="font-semibold mt-2">Prepared by</p>
              </div>
              <div className="text-center">
                <div className="border-t border-black w-48 mx-auto"></div>
                <p className="font-semibold mt-2">Approved by</p>
              </div>
            </div>
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
          body {
            background-color: #fff;
          }
          .printable-area {
            visibility: visible;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 1.5rem;
            border: none;
            color: #000;
          }
           .printable-area * {
            visibility: visible;
            font-family: 'Times New Roman', Times, serif;
           }
           .print\:hidden {
              display: none;
           }
        }
      `}</style>
    </>
  );
}
