'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Printer, ArrowLeft, Loader2, Save, Edit } from 'lucide-react';
import type { Report, CompanyProfile } from '@/lib/types';
import { getReport, logReportPrint, reportKindLabel } from '@/services/report-service';
import { onSettingUpdate } from '@/services/settings-service';
import { buildTestReportPdf, exportTestReportPdf } from '@/lib/test-report-pdf';
import { Button } from '@/components/ui/button';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

function ReportViewContent() {
    const searchParams = useSearchParams();
    const id = searchParams.get('id');
    const router = useRouter();
    const { toast } = useToast();
    const { user, hasPermission } = useAuth();

    const [report, setReport] = useState<Report | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const frameRef = useRef<HTMLIFrameElement>(null);
    // Phone browsers generally can't show a PDF inside a page; open it instead.
    const [inlinePdf, setInlinePdf] = useState(true);
    useEffect(() => {
        const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
        setInlinePdf(nav.pdfViewerEnabled !== false && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    }, []);
    const autoPrinted = useRef(false);

    useEffect(() => {
        if (!id) { setIsLoading(false); return; }
        getReport(id).then(setReport).catch(console.error).finally(() => setIsLoading(false));
        return onSettingUpdate('companyProfile', (s) => {
            // Fall back to the registry default rather than leaving the
            // letterhead blank when no profile has been saved yet.
            setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE);
        });
    }, [id]);

    // The page shows the same vector PDF that is printed and saved.
    useEffect(() => {
        if (!report) return;
        let url: string | null = null;
        buildTestReportPdf(report, companyProfile).then(doc => {
            url = URL.createObjectURL(doc.output('blob'));
            setPdfUrl(url);
        });
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [report, companyProfile]);

    const logPrint = (kind: 'print' | 'pdf') => {
        if (report) logReportPrint(report.id, { date: new Date().toISOString(), by: user?.username, kind });
    };

    const handlePrint = () => {
        const win = frameRef.current?.contentWindow;
        if (!win) {
            if (pdfUrl) window.open(pdfUrl, '_blank');
            logPrint('print');
            return;
        }
        try {
            win.focus();
            win.print();
        } catch {
            if (pdfUrl) window.open(pdfUrl, '_blank');
        }
        logPrint('print');
    };

    const handleExportPdf = async () => {
        if (!report) return;
        try {
            await exportTestReportPdf(report, companyProfile);
            logPrint('pdf');
        } catch {
            toast({ title: 'Export Failed', variant: 'destructive' });
        }
    };

    // Opened from the list's Print action.
    const onFrameLoad = () => {
        if (searchParams.get('print') === 'true' && !autoPrinted.current) {
            autoPrinted.current = true;
            setTimeout(handlePrint, 300);
        }
    };

    if (isLoading) return <div className="p-12 text-center h-[70vh] flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/></div>;

    if (!report) return (
        <div className="p-12 text-center space-y-4">
            <p className="text-muted-foreground font-medium italic">Test report not found or inaccessible.</p>
            <Button variant="outline" onClick={() => router.push('/reports/list')}>Back to Reports</Button>
        </div>
    );

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
            <header className="flex flex-wrap justify-between items-center gap-3 bg-muted/30 p-4 rounded-2xl border border-dashed">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-card shadow-sm border"><ArrowLeft className="h-5 w-5"/></Button>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight">{reportKindLabel(report)} #{report.serialNumber}</h1>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{report.product?.name} &bull; {report.product?.partyName}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {hasPermission('reports', 'edit') && (
                        <Button variant="outline" size="sm" onClick={() => router.push(`/report/new/?id=${report.id}`)} className="h-10 font-bold text-xs">
                            <Edit className="h-3.5 w-3.5 mr-2"/> Edit
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!pdfUrl} className="h-10 font-bold text-xs">
                        <Save className="h-3.5 w-3.5 mr-2"/> Save as PDF
                    </Button>
                    <Button onClick={handlePrint} disabled={!pdfUrl} className="h-10 px-6 font-black text-xs uppercase">
                        <Printer className="mr-2 h-4 w-4"/> Print
                    </Button>
                </div>
            </header>

            {pdfUrl && !inlinePdf ? (
                <div className="h-[50vh] flex flex-col items-center justify-center gap-3 border rounded-xl text-center p-6">
                    <p className="text-sm text-muted-foreground">This browser can&apos;t show the PDF inside the page.</p>
                    <Button onClick={() => window.open(pdfUrl, '_blank')}><Printer className="mr-2 h-4 w-4"/> Open PDF</Button>
                </div>
            ) : pdfUrl
                ? <iframe ref={frameRef} src={pdfUrl} onLoad={onFrameLoad} title={`Report ${report.serialNumber}`} className="w-full h-[80vh] rounded-xl border bg-white" />
                : <div className="h-[80vh] flex items-center justify-center border rounded-xl"><Loader2 className="animate-spin h-6 w-6 text-primary"/></div>}
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
