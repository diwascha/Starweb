
'use client';

import { Suspense, useEffect, useState } from 'react';
import { InvoiceCalculator } from '../../_components/invoice-calculator';
import { Skeleton } from '@/components/ui/skeleton';
import { getEstimatedInvoice } from '@/services/estimate-invoice-service';
import type { EstimatedInvoice } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

function FormSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
            </div>
             <div className="border rounded-lg p-4 space-y-4">
                <div className="flex justify-between">
                    <Skeleton className="h-8 w-1/4" />
                    <Skeleton className="h-8 w-1/4" />
                </div>
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-full" />
             </div>
             <div className="flex justify-end">
                <Skeleton className="h-10 w-32" />
             </div>
        </div>
    );
}

export default function EditEstimateInvoicePage({ params }: { params: { id: string } }) {
  const [invoiceToEdit, setInvoiceToEdit] = useState<EstimatedInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const invoice = await getEstimatedInvoice(params.id);
        if (invoice) {
          setInvoiceToEdit(invoice);
        } else {
          toast({ title: "Error", description: "Invoice not found.", variant: "destructive" });
        }
      } catch (error) {
        toast({ title: "Error", description: "Failed to fetch invoice data.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoice();
  }, [params.id, toast]);
  
  if (isLoading) {
    return <FormSkeleton />;
  }

  if (!invoiceToEdit) {
     return <div className="text-center">Invoice not found or could not be loaded.</div>
  }

  return (
    <div className="flex flex-col gap-8">
       <header>
        <h1 className="text-3xl font-bold tracking-tight">Edit Estimate Invoice</h1>
        <p className="text-muted-foreground">Modify the details for invoice #{invoiceToEdit.invoiceNumber}.</p>
      </header>
       <Suspense fallback={<FormSkeleton />}>
          <InvoiceCalculator invoiceToEdit={invoiceToEdit} />
       </Suspense>
    </div>
  );
}
