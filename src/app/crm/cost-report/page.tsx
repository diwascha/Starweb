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

import { calculateItemCost } from '@/lib/cost-calculator';
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
        
        const itemsWithCost = report.items.map((item: any) => {
            const calculated = calculateItemCost(item, kCosts, vCost, cCost, tCost, tType, false, aCCost);
            const accessories = (item.accessories || []).map((acc: any) => ({
                ...acc,
                calculated: calculateItemCost(acc, kCosts, vCost, cCost, tCost, tType, true, aCCost)
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
