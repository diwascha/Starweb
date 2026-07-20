'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CostReportCalculator } from '../_components/calculator';
import { onProductsUpdate } from '@/services/product-service';
import { onSettingUpdate } from '@/services/settings-service';
import { getCostReport } from '@/services/cost-report-service';
import type { CostReport, Product, CompanyProfile } from '@/lib/types';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import React from 'react';

const QuotationPreviewDialog = React.lazy(() => import('../_components/quotation-preview').then(m => ({ default: m.QuotationPreviewDialog })));

function CalculatorPageContent() {
    const searchParams = useSearchParams();
    const poId = searchParams.get('id');
    const router = useRouter();

    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubProfile = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE));
        
        if (poId) {
            getCostReport(poId).then(data => {
                setReportToEdit(data);
                setIsLoading(false);
            });
        } else {
            setIsLoading(false);
        }

        return () => {
            unsubProducts();
            unsubProfile();
        };
    }, [poId]);

    if (isLoading) {
        return (
            <div className="flex h-[70vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" onClick={() => router.push('/crm/cost-report')} className="h-8 w-8">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Costing Engine</h1>
                    </div>
                    <p className="text-muted-foreground ml-10">Technical manufacturing analysis and quotation generator.</p>
                </div>
                <Button variant="outline" onClick={() => router.push('/crm/cost-report')}>
                    <History className="mr-2 h-4 w-4" /> View History
                </Button>
            </header>

            <CostReportCalculator 
                reportToEdit={reportToEdit} 
                products={products} 
                companyProfile={companyProfile}
                onSaveSuccess={() => router.push('/crm/cost-report')} 
                onPreview={(data: any) => { setPreviewData(data); setIsPreviewOpen(true); }}
            />

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

export default function Page() {
    return (
        <Suspense fallback={<div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></div>}>
            <CalculatorPageContent />
        </Suspense>
    );
}
