'use client';

import { useRef, useState, useMemo } from 'react';
import type { Party, Product, CostReportTerm, CompanyProfile } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Printer, Image as ImageIcon, FileDown, Loader2 } from 'lucide-react';
import { toNepaliDate, normalizeBF } from '@/lib/utils';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface QuotationPreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  reportNumber: string;
  reportDate: Date;
  party: Party | null | undefined;
  items: (any)[];
  products: Product[];
  termsAndConditions?: CostReportTerm[];
  companyProfile: CompanyProfile;
}

export function QuotationPreviewDialog({ isOpen, onOpenChange, reportNumber, reportDate, party, items, products, termsAndConditions = [], companyProfile }: QuotationPreviewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const selectedTerms = useMemo(() => (termsAndConditions || []).filter(t => t.isSelected), [termsAndConditions]);

  const getProductDisplayName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? (product.materialCode ? `${product.name} (${product.materialCode})` : product.name) : 'Custom Item';
  };

  const handlePrint = () => {
    const printableArea = printRef.current;
    if (!printableArea) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Quotation</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f2f2f2;}.text-right{text-align:right;}.font-bold{font-weight:bold;}</style></head><body>');
    printWindow?.document.write(printableArea.innerHTML);
    printWindow?.document.write('</body></html>');
    printWindow?.document.close();
    printWindow?.focus();
    setTimeout(() => { printWindow?.print(); printWindow?.close(); }, 250);
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(companyProfile.nameEn, pageWidth / 2, 20, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(companyProfile.address, pageWidth / 2, 26, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('QUOTATION', pageWidth / 2, 38, { align: 'center' });
        doc.line(14, 40, pageWidth - 14, 40);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('To,', 14, 50);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(party?.name || 'N/A', 14, 56);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const addressLines = doc.splitTextToSize(party?.address || '', 100);
        doc.text(addressLines, 14, 62);
        
        let infoY = 62 + (addressLines.length * 5);
        if (party?.panNumber) {
            doc.text(`PAN/VAT: ${party.panNumber}`, 14, infoY);
            infoY += 5;
        }

        doc.text(`Ref No: ${reportNumber}`, pageWidth - 14, 56, { align: 'right' });
        const nepaliDateStr = toNepaliDate(reportDate.toISOString());
        doc.text(`Date: ${nepaliDateStr} BS`, pageWidth - 14, 62, { align: 'right' });
        doc.setFontSize(8);
        doc.text(`(${format(reportDate, "MMMM do, yyyy")})`, pageWidth - 14, 67, { align: 'right' });

        const tableData = items.flatMap((item, index) => {
            const main = [
                index + 1,
                getProductDisplayName(item.productId),
                `${item.l}x${item.b}x${item.h}`,
                `${item.ply} Ply`,
                `${item.paperType} ${normalizeBF(item.paperBf)}`,
                `Rs. ${item.totalItemCost.toFixed(2)}`
            ];
            const accs = (item.accessories || []).map((acc: any) => [
                '',
                `-- ${acc.name}`,
                `${acc.l}x${acc.b}x${acc.h}`,
                `${acc.ply} Ply`,
                `${acc.paperType} ${normalizeBF(acc.paperBf)}`,
                `Rs. ${acc.calculated?.paperCost.toFixed(2)}`
            ]);
            return [main, ...accs];
        });

        autoTable(doc, {
            startY: Math.max(infoY + 10, 80),
            head: [['S.N.', 'Particulars / Specifications', 'Size (mm)', 'Ply', 'Paper Grade', 'Rate (NPR)']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
            styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.1, textColor: [0, 0, 0] },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 60 },
                5: { halign: 'right' }
            }
        });

        let currentY = (doc as any).lastAutoTable.finalY + 15;

        if (selectedTerms.length > 0) {
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('Terms & Conditions:', 14, currentY);
            currentY += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            selectedTerms.forEach((term, i) => {
                const lines = doc.splitTextToSize(`${i + 1}. ${term.text}`, pageWidth - 28);
                if (currentY + (lines.length * 4) > 280) { doc.addPage(); currentY = 20; }
                doc.text(lines, 14, currentY);
                currentY += lines.length * 4 + 2;
            });
        }

        doc.save(`Quotation-${reportNumber}.pdf`);
    } catch (error) {
        console.error("PDF Export Error:", error);
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportImage = async () => {
    if (!printRef.current) return;
    setIsExporting(true);
    try {
        const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
        const link = document.createElement('a');
        link.download = `Quotation-${reportNumber}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    } catch (error) {
        console.error("Image Export Error:", error);
    } finally {
        setIsExporting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Quotation Preview</DialogTitle>
          <DialogDescription>Review the document layout. This is a paperless, digitally generated document.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 bg-muted/30 p-4">
            <div ref={printRef} className="w-[210mm] mx-auto bg-white p-12 text-black shadow-sm">
               <header className="text-center space-y-1 mb-8">
                    <h1 className="text-2xl font-bold uppercase tracking-tight">{companyProfile.nameEn}</h1>
                    <p className="text-base uppercase tracking-wide">{companyProfile.address}</p>
                    <h2 className="text-xl font-bold underline mt-4">QUOTATION</h2>
                </header>
                 <div className="grid grid-cols-2 text-sm mb-6">
                    <div>
                        <p className="text-muted-foreground uppercase font-bold text-[10px]">To,</p>
                        <p className="font-bold text-lg">{party?.name}</p>
                        <p className="whitespace-pre-line text-muted-foreground">{party?.address}</p>
                        {party?.panNumber && <p className="text-xs font-mono">PAN/VAT: {party.panNumber}</p>}
                    </div>
                    <div className="text-right">
                        <p><span className="font-semibold">Ref No:</span> {reportNumber}</p>
                        <p><span className="font-semibold">Date:</span> {toNepaliDate(reportDate.toISOString())} BS</p>
                        <p className="text-xs text-muted-foreground">({format(reportDate, "MMMM do, yyyy")})</p>
                    </div>
                </div>
                <Table className="text-xs border">
                    <TableHeader className="bg-muted/10">
                        <TableRow>
                            <TableHead className="w-12 text-black font-bold">S.N.</TableHead>
                            <TableHead className="text-black font-bold">Particulars / Specifications</TableHead>
                            <TableHead className="text-black font-bold">Size (mm)</TableHead>
                            <TableHead className="text-black font-bold">Ply</TableHead>
                            <TableHead className="text-black font-bold">Paper Grade</TableHead>
                            <TableHead className="text-black font-bold text-right">Rate (NPR)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.flatMap((item, index) => {
                            const mainRow = (
                                <TableRow key={item.id}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell className="font-bold">{getProductDisplayName(item.productId)}</TableCell>
                                    <TableCell>{item.l}x{item.b}x{item.h}</TableCell>
                                    <TableCell>{item.ply} Ply</TableCell>
                                    <TableCell>{item.paperType} {normalizeBF(item.paperBf)}</TableCell>
                                    <TableCell className="text-right font-bold">Rs. {item.totalItemCost.toFixed(2)}</TableCell>
                                </TableRow>
                            );
                            const accRows = (item.accessories || []).map((acc: any) => (
                                <TableRow key={acc.id} className="bg-muted/5 italic">
                                    <TableCell></TableCell>
                                    <TableCell className="pl-6">— {acc.name}</TableCell>
                                    <TableCell>{acc.l}x{acc.b}x{acc.h}</TableCell>
                                    <TableCell>{acc.ply} Ply</TableCell>
                                    <TableCell>{acc.paperType} {normalizeBF(acc.paperBf)}</TableCell>
                                    <TableCell className="text-right">Rs. {acc.calculated?.paperCost.toFixed(2)}</TableCell>
                                </TableRow>
                            ));
                            return [mainRow, ...accRows];
                        })}
                    </TableBody>
                </Table>
                {selectedTerms.length > 0 && (
                    <div className="mt-12">
                        <p className="font-bold underline text-sm mb-3">Terms & Conditions:</p>
                        <ol className="list-decimal pl-5 text-xs space-y-2">
                            {selectedTerms.map((term, i) => <li key={i}>{term.text}</li>)}
                        </ol>
                    </div>
                )}
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
        </ScrollArea>
        <DialogFooter className="p-6 bg-muted/20 border-t">
            <div className="flex w-full justify-between items-center">
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportImage} disabled={isExporting}>
                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                        Export Image
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting}>
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileDown className="mr-2 h-4 w-4"/>}
                        Export PDF
                    </Button>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
                    <Button size="sm" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print Quotation</Button>
                </div>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
