'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { 
    Printer, 
    ArrowLeft, 
    Loader2, 
    FileText, 
    ShieldCheck, 
    Save, 
    History,
    CheckCircle2,
    X,
    ImageIcon
} from 'lucide-react';
import type { Report, CompanyProfile } from '@/lib/types';
import { getReport } from '@/services/report-service';
import { onSettingUpdate } from '@/services/settings-service';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toNepaliDate, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

function ReportViewContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const [report, setReport] = useState<Report | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const id = params.id as string;
        if (!id) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const data = await getReport(id);
                setReport(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
        return onSettingUpdate('companyProfile', (s) => {
            if (s?.value) setCompanyProfile(s.value);
        });
    }, [params.id]);

    useEffect(() => {
        if (!isLoading && report && searchParams.get('print') === 'true') {
            setTimeout(() => window.print(), 1000);
        }
    }, [isLoading, report, searchParams]);

    const handleExportPdf = async () => {
        if (!report) return;
        setIsExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const html2canvas = (await import('html2canvas')).default;
            const element = document.querySelector('.printable-area') as HTMLElement;
            if (!element) return;

            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`QT-Report-${report.serialNumber}.pdf`);
            toast({ title: 'Export Successful' });
        } catch (error) {
            toast({ title: 'Export Failed', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const formatLabel = (key: string) => {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    };

    if (isLoading) return <div className="p-12 text-center h-[70vh] flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Authenticating document sequence...</p></div>;
    
    if (!report) return (
        <div className="p-12 text-center space-y-4">
            <p className="text-muted-foreground font-medium italic">Test report record not found or inaccessible.</p>
            <Button variant="outline" onClick={() => router.push('/reports/list')}>Back to Database</Button>
        </div>
    );

    const testEntries = Object.entries(report.testData || {});

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-20">
            <header className="flex justify-between items-center print:hidden bg-muted/30 p-6 rounded-2xl border border-dashed">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white shadow-sm border"><ArrowLeft className="h-5 w-5"/></Button>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight">Voucher #{report.serialNumber}</h1>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{report.product?.name}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting} className="h-10 px-4 font-bold text-[10px] uppercase tracking-widest">
                        {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2"/> : <Save className="h-3.5 w-3.5 mr-2"/>}
                        Save as PDF
                    </Button>
                    <Button onClick={() => window.print()} className="h-10 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                        <Printer className="mr-2 h-4 w-4"/> Print Report
                    </Button>
                </div>
            </header>

            <div className="printable-area p-12 bg-white text-black border shadow-2xl ring-1 ring-black/5 min-h-[297mm] flex flex-col">
                <header className="text-center space-y-1 mb-10 border-b-2 border-neutral-900 pb-6">
                    <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                    <h2 className="text-lg font-semibold">{companyProfile.nameNp}</h2>
                    <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest">{companyProfile.address}</p>
                    <h2 className="text-xl font-black underline mt-8 uppercase tracking-[0.3em]">QUALITY TEST REPORT</h2>
                </header>

                <div className="grid grid-cols-2 gap-12 text-sm mb-10">
                    <section className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase border-b border-neutral-200 pb-1 text-neutral-400 tracking-widest">Client & Shipment</h3>
                        <div className="space-y-2">
                            <p><span className="font-bold uppercase text-[9px] text-neutral-400 block">Product Label:</span> <span className="font-black text-base">{report.product?.name}</span></p>
                            <p><span className="font-bold uppercase text-[9px] text-neutral-400 block">Material Code:</span> <span className="font-black text-blue-700 font-mono">{report.product?.materialCode || 'N/A'}</span></p>
                            <p><span className="font-bold uppercase text-[9px] text-neutral-400 block">Recipient:</span> <span className="font-black">{report.product?.partyName || 'N/A'}</span></p>
                        </div>
                    </section>
                    <div className="text-right space-y-4">
                        <h3 className="text-[10px] font-black uppercase border-b border-neutral-200 pb-1 text-neutral-400 tracking-widest">Document Audit</h3>
                        <div className="space-y-2">
                            <p><span className="font-bold uppercase text-[9px] text-neutral-400 block">Report Serial:</span> <span className="font-black text-lg">{report.serialNumber}</span></p>
                            <p><span className="font-bold uppercase text-[9px] text-neutral-400 block">Date (BS):</span> <span className="font-black">{toNepaliDate(report.date)}</span></p>
                            <p><span className="font-bold uppercase text-[9px] text-neutral-400 block">Tax Invoice:</span> <span className="font-black font-mono">{report.taxInvoiceNumber}</span></p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 space-y-10">
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-1.5 bg-neutral-100 rounded-lg"><ShieldCheck className="h-4 w-4"/></div>
                            <h3 className="text-[11px] font-black uppercase tracking-[0.1em]">Technical Specification Verification</h3>
                        </div>
                        <div className="border-2 border-neutral-900 rounded-xl overflow-hidden">
                            <Table className="text-xs">
                                <TableHeader className="bg-neutral-100 border-b-2 border-neutral-900 h-10">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="text-black font-black uppercase text-[10px] pl-6 border-r border-neutral-300">Parameter Particulars</TableHead>
                                        <TableHead className="text-black font-black uppercase text-[10px] text-center border-r border-neutral-300">Standard Spec</TableHead>
                                        <TableHead className="text-black font-black uppercase text-[10px] text-right pr-6 bg-neutral-50">Observed Result</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {testEntries.map(([key, data]) => (
                                        <TableRow key={key} className="h-11 border-b border-neutral-200 hover:bg-transparent">
                                            <TableCell className="pl-6 font-bold uppercase text-[10px] text-neutral-500 border-r border-neutral-200">{formatLabel(key)}</TableCell>
                                            <TableCell className="text-center font-medium border-r border-neutral-200">{report.product?.specification[key as keyof ProductSpecification] || '—'}</TableCell>
                                            <TableCell className="text-right pr-6 font-black tabular-nums text-sm">{(data as any).value || '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="h-12 bg-neutral-50/50 hover:bg-transparent border-t-2 border-neutral-900">
                                        <TableCell className="pl-6 font-black uppercase text-[10px] border-r border-neutral-200">Dispatch Batch Quantity</TableCell>
                                        <TableCell className="border-r border-neutral-200"></TableCell>
                                        <TableCell className="text-right pr-6 font-black uppercase text-sm">{report.quantity}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </section>

                    <section className="grid grid-cols-2 gap-8">
                        <div className="p-6 bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-200 space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Quality Assessment</h4>
                            <div className="flex items-center gap-2 text-emerald-600">
                                <CheckCircle2 className="h-5 w-5"/>
                                <span className="text-base font-black uppercase tracking-tight">PASSED QC INSPECTION</span>
                            </div>
                            <p className="text-[10px] text-neutral-500 leading-relaxed italic">The manufactured batch satisfies the technical standards defined in the QT Catalog for this product variant.</p>
                        </div>
                        <div className="flex flex-col justify-center">
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-1">Production Audit</p>
                                    <p className="text-xs font-bold uppercase">Operator: {report.createdBy}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-1">Authorized By</p>
                                    <p className="text-xs font-bold uppercase">Shivam Packaging Quality Control</p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <footer className="mt-20 pt-8 border-t border-dashed border-neutral-300 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400">
                        Generated via StarSutra Intelligence &bull; Valid without manual signature
                    </p>
                </footer>
            </div>

            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 0.5in; }
                    body { background: white !important; }
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; padding: 0; margin: 0; }
                    .print\\:hidden { display: none !important; }
                }
            `}</style>
        </div>
    );
}

export default function ReportPage() {
    return (
        <Suspense fallback={<div className="p-12 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-primary"/></div>}>
            <ReportViewContent />
        </Suspense>
    );
}
