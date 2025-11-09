
'use client';

import { useEffect, useState } from 'react';
import type { Report, ProductSpecification } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, Save } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';
import { updateReport } from '@/services/report-service';

const orderedSpecificationKeys: (keyof ProductSpecification)[] = [
  'dimension',
  'ply',
  'weightOfBox',
  'gsm',
  'stapleWidth',
  'stapling',
  'overlapWidth',
  'printing',
  'moisture',
  'load',
];

export default function ReportView({ initialReport }: { initialReport: Report }) {
  const [report, setReport] = useState<Report>(initialReport);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  const handlePrint = async () => {
    if (!report) return;
    
    const newLogEntry = { date: new Date().toISOString() };
    const updatedReportData = {
        ...report,
        printLog: [...(report.printLog || []), newLogEntry],
    };
    
    try {
        await updateReport(report.id, { printLog: updatedReportData.printLog });
        setReport(updatedReportData);
        
        // Use a timeout to ensure state update is processed before printing
        setTimeout(() => {
          window.print();
        }, 100);

    } catch (error) {
        console.error("Failed to update print log before printing", error);
        // Still attempt to print even if logging fails
        setTimeout(() => {
          window.print();
        }, 100);
    }
  };

  const handleSaveAsPdf = async () => {
    if (!report) return;
    
    setIsGeneratingPdf(true);
    const printableArea = document.querySelector('.printable-area') as HTMLElement;
    if (!printableArea) {
        setIsGeneratingPdf(false);
        return;
    }
    
    const jsPDF = (await import('jspdf')).default;
    const html2canvas = (await import('html2canvas')).default;

    // Add to print log
    const newLogEntry = { date: new Date().toISOString() };
    const updatedReportData = {
        ...report,
        printLog: [...(report.printLog || []), newLogEntry],
    };
    setReport(updatedReportData);
    await updateReport(report.id, { printLog: updatedReportData.printLog });
    
    try {
        const canvas = await html2canvas(printableArea, {
            scale: 2, // Higher scale for better quality
            useCORS: true,
            logging: false,
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'px',
            format: 'a4',
        });
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const ratio = canvasWidth / canvasHeight;
        const pdfHeight = pdfWidth / ratio;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Report-${report.serialNumber}.pdf`);
    } catch (error) {
        console.error("Error generating PDF", error);
    } finally {
        setIsGeneratingPdf(false);
    }
  };


  if (!report) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Report not found.</p>
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
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveAsPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isGeneratingPdf ? 'Saving...' : 'Save as PDF'}
            </Button>
             <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
            </Button>
        </div>
      </div>

      <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-1 mb-4 relative">
            <div className="pt-8">
              <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
              <h2 className="text-lg font-semibold"> शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
              <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
              <h2 className="text-lg font-semibold underline mt-1">TEST REPORT</h2>
            </div>
        </header>
        
        <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
            <div><span className="font-semibold">Test Serial No:</span> {report.serialNumber}</div>
            <div className="text-right"><span className="font-semibold">Date:</span> {nepaliDateString} B.S. ({new Date(report.date).toLocaleDateString('en-CA')})</div>
            <div><span className="font-semibold">Tax Invoice No:</span> {report.taxInvoiceNumber}</div>
            <div className="text-right"><span className="font-semibold">Challan No:</span> {report.challanNumber}</div>
        </div>
        
        <Separator className="my-2 bg-gray-300"/>

        <Card className="shadow-none border-gray-300">
          <CardHeader className="p-2">
            <CardTitle className="text-base">Product Test Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-2">
             <section>
                <h2 className="text-base font-semibold mb-1">Product Information</h2>
                <div className="grid grid-cols-2 gap-x-4 text-xs">
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
                    <div>
                        <span className="font-medium">Supplied Quantities: </span>
                        <span>{report.quantity}</span>
                    </div>
                </div>
            </section>
            <Separator className="my-2 bg-gray-300"/>
            <section>
              <h2 className="text-base font-semibold mb-1">Test Parameters & Results</h2>
              <div className="border rounded-lg border-gray-300">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-gray-300">
                      <TableHead className="text-black font-semibold h-8 px-2 text-xs">Parameter</TableHead>
                      <TableHead className="text-black font-semibold h-8 px-2 text-xs">Standard</TableHead>
                      <TableHead className="text-black font-semibold h-8 px-2 text-xs">Result</TableHead>
                      <TableHead className="text-black font-semibold h-8 px-2 text-xs">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.product.specification && orderedSpecificationKeys.map((key) => {
                      const specKey = key as keyof ProductSpecification;
                      const standardValue = report.product.specification?.[specKey];
                      
                      if (!standardValue || String(standardValue).trim() === '') {
                        return null;
                      }
                      
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
                          <TableCell className="font-medium px-2 py-1 text-xs">
                            {formatLabel(key)}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs">{displayStandard}</TableCell>
                          <TableCell className="px-2 py-1 text-xs">{displayResult}</TableCell>
                          <TableCell className="px-2 py-1 text-xs">{remarkValue}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
            <div className="mt-8 grid grid-cols-2 gap-8 pt-8 text-xs">
              <div className="text-center">
                <div className="border-t border-black w-36 mx-auto"></div>
                <p className="font-semibold mt-1">Prepared by</p>
              </div>
              <div className="text-center">
                <div className="border-t border-black w-36 mx-auto"></div>
                <p className="font-semibold mt-1">Approved by</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {report.printLog && report.printLog.length > 0 && (
           <Card className="print:hidden mt-8">
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

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0.3in 0.8in 0 0.8in;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: #fff !important;
          }
          body > * {
            visibility: hidden;
          }
          .printable-area, .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto; 
            margin: 0;
            padding: 0;
            border: none;
            font-size: 10px; /* Smaller base font size for print */
          }
           .print\:hidden {
              display: none !important;
           }
        }
      `}</style>
    </>
  );
}
