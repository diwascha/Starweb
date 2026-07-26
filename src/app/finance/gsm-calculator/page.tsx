'use client';

import { useState, useEffect, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calculator, History as HistoryIcon, Printer, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GsmGeneratorForm } from './_components/gsm-form';
import { GsmReportsList } from './_components/gsm-list';
import { onGsmReportsUpdate } from '@/services/gsm-service';
import type { GsmReport } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { GsmReportView } from './_components/gsm-view';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export default function GsmCalculatorPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('calculator');
    const [reports, setReports] = useState<GsmReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    const [selectedReport, setSelectedReport] = useState<GsmReport | null>(null);
    const [reportToEdit, setReportToEdit] = useState<GsmReport | null>(null);

    useEffect(() => {
        const unsub = onGsmReportsUpdate((data) => {
            setReports(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    const handlePrint = (report: GsmReport) => {
        setSelectedReport(report);
        setIsPrintDialogOpen(true);
    };

    const handleEdit = (report: GsmReport) => {
        setReportToEdit(report);
        setActiveTab('calculator');
    };

    const handleSaveSuccess = () => {
        setReportToEdit(null);
        setActiveTab('history');
    };

    const executePrint = () => {
        const win = window.open('', '', 'height=800,width=900');
        if (!win) return;
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(s => s.outerHTML).join('');
        
        win.document.write(`<html><head><title>GSM Report</title>${styles}</head><body>`);
        win.document.write(document.querySelector('.gsm-voucher')?.outerHTML || '');
        win.document.write('</body></html>');
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/finance')} className="h-10 w-10 border shadow-sm">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">GSM Logic & Archive</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Compute and store paper grammage verification logs.</p>
                    </div>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={(v) => { if(v === 'calculator' && activeTab !== 'calculator') setReportToEdit(null); setActiveTab(v); }} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-6">
                    <TabsTrigger value="calculator" className="gap-2 px-8 py-2 font-bold text-[10px] uppercase tracking-widest">
                        <Calculator className="h-3.5 w-3.5"/>
                        Verification Form
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-8 py-2 font-bold text-[10px] uppercase tracking-widest">
                        <HistoryIcon className="h-3.5 w-3.5"/>
                        Archived Logs
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="calculator" className="animate-in fade-in slide-in-from-left-2 duration-300">
                    <GsmGeneratorForm 
                        reportToEdit={reportToEdit} 
                        onSaveSuccess={handleSaveSuccess} 
                    />
                </TabsContent>

                <TabsContent value="history" className="animate-in fade-in slide-in-from-right-2 duration-300">
                    <GsmReportsList 
                        reports={reports} 
                        onPrint={handlePrint} 
                        onEdit={handleEdit}
                    />
                </TabsContent>
            </Tabs>

            <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
                <DialogContent className="max-w-[240mm] h-[95vh] flex flex-col p-0 border-none shadow-2xl bg-white overflow-hidden">
                    <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl font-black uppercase tracking-tight">Report Preview</DialogTitle>
                            <Button variant="ghost" size="icon" onClick={() => setIsPrintDialogOpen(false)}><X className="h-4 w-4"/></Button>
                        </div>
                    </DialogHeader>
                    <ScrollArea className="flex-1 bg-muted/20 p-4 sm:p-12">
                        {selectedReport && (
                            <div className="mx-auto shadow-2xl">
                                <GsmReportView report={selectedReport} />
                            </div>
                        )}
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-white shrink-0">
                        <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)} className="h-10 px-8 font-bold uppercase text-[10px]">Close Preview</Button>
                        <Button onClick={executePrint} className="h-10 px-10 font-black uppercase text-[10px] shadow-lg">
                            <Printer className="mr-2 h-4 w-4" /> Direct Print
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
