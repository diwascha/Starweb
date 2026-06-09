'use client';

import { useRef, useState, useMemo } from 'react';
import type { Party, Product, CostReportTerm, CompanyProfile } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Printer, Image as ImageIcon, FileDown, Loader2, Settings2, CheckCircle2 } from 'lucide-react';
import { toNepaliDate, normalizeBF } from '@/lib/utils';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

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
  
  // Customization Options
  const [options, setOptions] = useState({
    showSize: true,
    showPly: true,
    showPaperGrade: true,
    showGSM: false,
    showAccessories: true,
    showRate: true,
    showTerms: true,
    showSN: true,
  });

  const selectedTerms = useMemo(() => (termsAndConditions || []).filter(t => t.isSelected), [termsAndConditions]);

  const getProductDisplayName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? (product.materialCode ? `${product.name} (${product.materialCode})` : product.name) : 'Custom Item';
  };

  const handlePrint = () => {
    const printableArea = printRef.current;
    if (!printableArea) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Quotation</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f2f2f2;}.text-right{text-align:right;}.font-bold{font-weight:bold;}.italic{font-style:italic;}.bg-muted-5{background-color:rgba(0,0,0,0.05);}.pl-6{padding-left:24px;}</style></head><body>');
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

        const tableHeaders = ['S.N.', 'Particulars / Specifications'];
        if (options.showSize) tableHeaders.push('Size (mm)');
        if (options.showPly) tableHeaders.push('Ply');
        if (options.showPaperGrade) tableHeaders.push('Paper Grade');
        if (options.showGSM) tableHeaders.push('Composition');
        if (options.showRate) tableHeaders.push('Rate (NPR)');

        const tableData = items.flatMap((item, index) => {
            const row = [];
            if (options.showSN) row.push(index + 1); else row.push('');
            row.push(getProductDisplayName(item.productId));
            if (options.showSize) row.push(`${item.l}x${item.b}x${item.h}`);
            if (options.showPly) row.push(`${item.ply} Ply`);
            if (options.showPaperGrade) row.push(`${item.paperType} ${normalizeBF(item.paperBf)}`);
            if (options.showGSM) row.push(item.calculated?.totalGsm?.toFixed(0) || '');
            if (options.showRate) row.push(`Rs. ${item.totalItemCost.toFixed(2)}`);

            const accs = options.showAccessories ? (item.accessories || []).map((acc: any) => {
                const accRow = [];
                accRow.push('');
                accRow.push(`-- ${acc.name}`);
                if (options.showSize) accRow.push(`${acc.l}x${acc.b}x${acc.h}`);
                if (options.showPly) accRow.push(`${acc.ply} Ply`);
                if (options.showPaperGrade) accRow.push(`${acc.paperType} ${normalizeBF(acc.paperBf)}`);
                if (options.showGSM) accRow.push(acc.calculated?.totalGsm?.toFixed(0) || '');
                if (options.showRate) accRow.push(`Rs. ${acc.calculated?.paperCost.toFixed(2)}`);
                return accRow;
            }) : [];

            return [row, ...accs];
        });

        autoTable(doc, {
            startY: Math.max(infoY + 10, 80),
            head: [tableHeaders],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
            styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.1, textColor: [0, 0, 0] },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 'auto' },
            }
        });

        let currentY = (doc as any).lastAutoTable.finalY + 15;

        if (options.showTerms && selectedTerms.length > 0) {
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

  const getGsmDisplay = (item: any) => {
      return item.calculated?.totalGsm?.toFixed(0) || 'N/A';
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Quotation Preview & Customization
              </DialogTitle>
              <DialogDescription>Select the information you want to present to the client.</DialogDescription>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Options Panel */}
          <aside className="w-80 border-r bg-muted/10 p-6 space-y-6 overflow-y-auto print:hidden shrink-0">
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Column Visibility
              </h3>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-sn" className="text-xs cursor-pointer">S.N. Column</Label>
                  <Switch id="opt-sn" checked={options.showSN} onCheckedChange={v => setOptions(p => ({...p, showSN: v}))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-size" className="text-xs cursor-pointer">Dimensions (Size)</Label>
                  <Switch id="opt-size" checked={options.showSize} onCheckedChange={v => setOptions(p => ({...p, showSize: v}))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-ply" className="text-xs cursor-pointer">Ply Count</Label>
                  <Switch id="opt-ply" checked={options.showPly} onCheckedChange={v => setOptions(p => ({...p, showPly: v}))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-grade" className="text-xs cursor-pointer">Paper Grade (BF)</Label>
                  <Switch id="opt-grade" checked={options.showPaperGrade} onCheckedChange={v => setOptions(p => ({...p, showPaperGrade: v}))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-gsm" className="text-xs cursor-pointer">GSM Composition</Label>
                  <Switch id="opt-gsm" checked={options.showGSM} onCheckedChange={v => setOptions(p => ({...p, showGSM: v}))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-rate" className="text-xs cursor-pointer font-bold text-primary">Rate / Total Cost</Label>
                  <Switch id="opt-rate" checked={options.showRate} onCheckedChange={v => setOptions(p => ({...p, showRate: v}))} />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Content Toggles
              </h3>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-acc" className="text-xs cursor-pointer">Individual Accessory Rows</Label>
                  <Switch id="opt-acc" checked={options.showAccessories} onCheckedChange={v => setOptions(p => ({...p, showAccessories: v}))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="opt-terms" className="text-xs cursor-pointer">Terms & Conditions</Label>
                  <Switch id="opt-terms" checked={options.showTerms} onCheckedChange={v => setOptions(p => ({...p, showTerms: v}))} />
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Note: Rates displayed are calculated based on the technical specs and wastage percentage provided in the calculator.
                </p>
            </div>
          </aside>

          {/* Preview Area */}
          <ScrollArea className="flex-1 bg-muted/30 p-8">
            <div ref={printRef} className="w-[210mm] mx-auto bg-white p-12 text-black shadow-lg ring-1 ring-black/5 min-h-[297mm]">
               <header className="text-center space-y-1 mb-10">
                    <h1 className="text-2xl font-bold uppercase tracking-tight">{companyProfile.nameEn}</h1>
                    <p className="text-base uppercase tracking-wide">{companyProfile.address}</p>
                    <h2 className="text-xl font-bold underline mt-6">QUOTATION</h2>
                </header>

                <div className="grid grid-cols-2 text-sm mb-8">
                    <div>
                        <p className="text-muted-foreground uppercase font-bold text-[10px] mb-1">To,</p>
                        <p className="font-bold text-lg">{party?.name}</p>
                        <p className="whitespace-pre-line text-muted-foreground text-xs leading-relaxed">{party?.address}</p>
                        {party?.panNumber && <p className="text-xs font-mono mt-1">PAN/VAT: {party.panNumber}</p>}
                    </div>
                    <div className="text-right space-y-0.5">
                        <p className="text-sm"><span className="font-semibold text-muted-foreground uppercase text-[10px]">Ref No:</span> {reportNumber}</p>
                        <p className="text-sm"><span className="font-semibold text-muted-foreground uppercase text-[10px]">Date:</span> {toNepaliDate(reportDate.toISOString())} BS</p>
                        <p className="text-[10px] text-muted-foreground">({format(reportDate, "MMMM do, yyyy")})</p>
                    </div>
                </div>

                <Table className="text-[11px] border border-black/10">
                    <TableHeader className="bg-muted/5">
                        <TableRow className="hover:bg-transparent border-black/10">
                            {options.showSN && <TableHead className="w-12 text-black font-bold">S.N.</TableHead>}
                            <TableHead className="text-black font-bold">Particulars / Specifications</TableHead>
                            {options.showSize && <TableHead className="text-black font-bold text-center">Size (mm)</TableHead>}
                            {options.showPly && <TableHead className="text-black font-bold text-center">Ply</TableHead>}
                            {options.showPaperGrade && <TableHead className="text-black font-bold text-center">Paper Grade</TableHead>}
                            {options.showGSM && <TableHead className="text-black font-bold text-center">Composition</TableHead>}
                            {options.showRate && <TableHead className="text-black font-bold text-right">Rate (NPR)</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.flatMap((item, index) => {
                            const mainRow = (
                                <TableRow key={item.id} className="border-black/5 hover:bg-transparent">
                                    {options.showSN && <TableCell className="text-center">{index + 1}</TableCell>}
                                    <TableCell className="font-bold py-3">{getProductDisplayName(item.productId)}</TableCell>
                                    {options.showSize && <TableCell className="text-center">{item.l}x{item.b}x{item.h}</TableCell>}
                                    {options.showPly && <TableCell className="text-center">{item.ply} Ply</TableCell>}
                                    {options.showPaperGrade && <TableCell className="text-center">{item.paperType} {normalizeBF(item.paperBf)}</TableCell>}
                                    {options.showGSM && <TableCell className="text-center">{getGsmDisplay(item)}</TableCell>}
                                    {options.showRate && <TableCell className="text-right font-bold">Rs. {item.totalItemCost.toFixed(2)}</TableCell>}
                                </TableRow>
                            );
                            const accRows = options.showAccessories ? (item.accessories || []).map((acc: any) => (
                                <TableRow key={acc.id} className="bg-muted/5 italic border-black/5 border-dashed hover:bg-transparent">
                                    {options.showSN && <TableCell></TableCell>}
                                    <TableCell className="pl-6 text-muted-foreground">— {acc.name}</TableCell>
                                    {options.showSize && <TableCell className="text-center text-muted-foreground">{acc.l}x{acc.b}x{acc.h}</TableCell>}
                                    {options.showPly && <TableCell className="text-center text-muted-foreground">{acc.ply} Ply</TableCell>}
                                    {options.showPaperGrade && <TableCell className="text-center text-muted-foreground">{acc.paperType} {normalizeBF(acc.paperBf)}</TableCell>}
                                    {options.showGSM && <TableCell className="text-center text-muted-foreground">{getGsmDisplay(acc)}</TableCell>}
                                    {options.showRate && <TableCell className="text-right text-muted-foreground">Rs. {acc.calculated?.paperCost.toFixed(2)}</TableCell>}
                                </TableRow>
                            )) : [];
                            return [mainRow, ...accRows];
                        })}
                    </TableBody>
                </Table>

                {options.showTerms && selectedTerms.length > 0 && (
                    <div className="mt-16">
                        <p className="font-bold underline text-xs mb-4 uppercase tracking-wide">Terms & Conditions:</p>
                        <ol className="list-decimal pl-5 text-[10px] space-y-2 text-muted-foreground">
                            {selectedTerms.map((term, i) => <li key={i}>{term.text}</li>)}
                        </ol>
                    </div>
                )}
                
                <footer className="mt-20 pt-10 border-t border-dashed border-black/10 flex justify-between items-end">
                    <div className="text-[10px] text-muted-foreground">
                        <p>Valid for: 15 Days</p>
                        <p>Issued by: {companyProfile.nameEn}</p>
                    </div>
                    <div className="text-center">
                        <div className="w-32 border-b border-black mb-1"></div>
                        <p className="text-[10px] font-bold uppercase">Authorized Signatory</p>
                    </div>
                </footer>
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>

        <DialogFooter className="p-6 bg-muted/20 border-t print:hidden shrink-0">
            <div className="flex w-full justify-between items-center">
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" onClick={handleExportImage} disabled={isExporting} className="h-10 px-4">
                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                        Export Image
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting} className="h-10 px-4">
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileDown className="mr-2 h-4 w-4"/>}
                        Export PDF
                    </Button>
                </div>
                <div className="flex gap-3">
                    <Button size="sm" onClick={handlePrint} className="h-10 px-6 font-bold"><Printer className="mr-2 h-4 w-4" /> Print Quotation</Button>
                </div>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
