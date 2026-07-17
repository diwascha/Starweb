'use client';

import { useState, useEffect, Suspense } from 'react';
import type { 
  CostReport, 
  Product, 
  CompanyProfile 
} from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { 
  deleteCostReport
} from '@/services/cost-report-service';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, 
  Loader2
} from 'lucide-react';
import { cn, normalizeBF } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { onSettingUpdate } from '@/services/settings-service';
import React from 'react';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import { useRouter } from 'next/navigation';

// Internal Components
import { SavedReportsList } from './_components/reports-list';

// Externalized heavy UI components
const QuotationPreviewDialog = React.lazy(() => import('./_components/quotation-preview').then(m => ({ default: m.QuotationPreviewDialog })));

export default function CostReportHistoryPage() {
    const router = useRouter();
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
    const { toast } = useToast();

    useEffect(() => {
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubProfile = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE));
        return () => {
            unsubProducts();
            unsubProfile();
        };
    }, []);

    const handlePreviewFromList = (report: CostReport) => {
        const kCosts = report.kraftPaperCosts || {};
        const vCost = report.virginPaperCost || 0;
        const cCost = report.conversionCost || 0;
        const aCCost = report.accessoryConversionCost || 0;
        const tCost = report.transportCost || 0;
        const tType = report.transportCostType || 'Per Consignment';
        
        const calc = (item: any, isAcc = false) => {
            const l = parseFloat(item.l) || 0, b = parseFloat(item.b) || 0, h = parseFloat(item.h) || 0, pcs = parseInt(item.noOfPcs, 10) || 1;
            const isBox = h > 0;
            let sL = 0, sB = 0;
            if (isBox) {
                const c1 = b + h + 20, d1 = (2 * l) + (2 * b) + 62, c2 = l + h + 20, d2 = (2 * b) + (2 * l) + 62;
                if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; }
            } else { const d = [l, b].sort((x: number, y: number) => y - x); sL = d[0]; sB = d[1]; }
            const ply = parseInt(item.ply, 10) || 0;
            const g = { l1: parseFloat(item.topGsm) || 0, f1: parseFloat(item.flute1Gsm) || 0, l2: parseFloat(item.middleGsm) || 0, f2: parseFloat(item.flute2Gsm) || 0, l3: parseFloat(item.liner2Gsm) || 0, f3: parseFloat(item.flute3Gsm) || 0, l4: parseFloat(item.liner3Gsm) || 0, f4: parseFloat(item.flute4Gsm) || 0, l5: parseFloat(item.bottomGsm) || 0 };
            let tGsm = 0; const factor = 1.35;
            if (ply === 3) tGsm = g.l1 + (g.f1 * factor) + g.l5;
            else if (ply === 5) tGsm = g.l1 + (g.f1 * factor) + g.l2 + (g.f2 * factor) + g.l5;
            else if (ply === 7) tGsm = g.l1 + (g.f1 * factor) + g.l2 + (g.f2 * factor) + g.l3 + (g.f3 * factor) + g.l5;
            else if (ply === 9) tGsm = g.l1 + (g.f1 * factor) + g.l2 + (g.f2 * factor) + g.l3 + (g.f3 * factor) + g.l4 + (g.f4 * factor) + g.l5;
            else tGsm = g.l1 + g.l5;
            const sArea = (sL * sB) / 1000000;
            const pWt = sArea * tGsm * pcs;
            const tBWt = pWt * (1 + (parseFloat(item.wastagePercent) / 100 || 0));
            let pRate = item.paperType === 'VIRGIN' ? vCost : (kCosts[normalizeBF(item.paperBf)] || 0);
            const finalRate = pRate + (isAcc ? aCCost : cCost);
            let paperCost = (tBWt / 1000) * finalRate;
            let tAmount = 0;
            if (tType === 'Per Piece' && !isAcc) {
                tAmount = tCost * pcs;
            }
            return { paperCost: paperCost, transportCost: tAmount };
        };

        const itemsWithCost = report.items.map((item: any) => {
            const calculated = calc(item);
            const accessories = (item.accessories || []).map((acc: any) => ({
                ...acc,
                calculated: calc(acc, true)
            }));
            return {
                ...item,
                accessories,
                calculated,
                totalItemCost: (calculated.paperCost || 0) + (calculated.transportCost || 0) + accessories.reduce((sum: number, a: any) => sum + (a.calculated?.paperCost || 0), 0)
            };
        });

        setPreviewData({
            reportNumber: report.reportNumber,
            reportDate: new Date(report.reportDate),
            party: { id: report.partyId, name: report.partyName },
            items: itemsWithCost,
            termsAndConditions: report.termsAndConditions || [],
            transportCost: report.transportCost || 0,
            transportCostType: report.transportCostType || 'Per Consignment'
        });
        setIsPreviewOpen(true);
    };

    const handleDeleteReport = async (id: string) => {
        try {
            await deleteCostReport(id);
            toast({ title: 'Report Deleted' });
        } catch {
            toast({ title: 'Error', description: 'Failed to delete report.', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Cost Report Generator</h1>
                    <p className="text-muted-foreground">Historical logs of manufacturing estimates and quotations.</p>
                </div>
                <Button onClick={() => router.push('/crm/cost-report/calculator')} className="h-10 px-6 font-bold shadow-lg">
                    <PlusCircle className="mr-2 h-4 w-4" /> New Costing
                </Button>
            </header>
            
            <div className="pt-0">
                <SavedReportsList 
                    onEdit={(r: any) => router.push(`/crm/cost-report/calculator?id=${r.id}`)} 
                    onPreview={handlePreviewFromList}
                    onDelete={handleDeleteReport}
                />
            </div>

            <Suspense fallback={<Loader2 className="animate-spin" />}>
                <QuotationPreviewDialog 
                    isOpen={isPreviewOpen} 
                    onOpenChange={setIsPreviewOpen} 
                    reportNumber={previewData?.reportNumber || ''}
                    reportDate={previewData?.reportNumber ? (previewData.reportDate || new Date()) : new Date()}
                    party={previewData?.party}
                    items={previewData?.items || []}
                    products={products}
                    termsAndConditions={previewData?.termsAndConditions}
                    companyProfile={companyProfile}
                    transportCost={previewData?.transportCost}
                    transportCostType={previewData?.transportCostType}
                />
            </Suspense>
        </div>
  );
}
