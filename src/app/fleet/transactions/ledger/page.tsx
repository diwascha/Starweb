'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ShoppingCart, TrendingUp, Wallet, Receipt, CreditCard, BookOpen } from 'lucide-react';
import { PurchaseView } from './_views/purchase-view';
import { SalesView } from './_views/sales-view';
import { ExpensesView } from './_views/expenses-view';
import { VouchersView } from './_views/vouchers-view';
import { GrandLedgerView } from './_views/grand-view';

const VIEWS = [
    { value: 'grand', label: 'Grand Ledger', description: 'Every transaction, all ledgers combined', icon: CreditCard },
    { value: 'purchase', label: 'Purchase', description: 'Accrued purchase-side charges (parts, credit, etc.)', icon: ShoppingCart },
    { value: 'sales', label: 'Sales (Trip Sheets)', description: 'Freight income booked per trip', icon: TrendingUp },
    { value: 'expenses', label: 'Expenses', description: 'Operational cash/bank payment outflows', icon: Wallet },
    { value: 'vouchers', label: 'Payment & Receipts', description: 'Multi-entry settlement vouchers', icon: Receipt },
] as const;

type ViewKey = typeof VIEWS[number]['value'];

function isViewKey(v: string | null): v is ViewKey {
    return !!v && VIEWS.some(x => x.value === v);
}

function LedgerPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeView: ViewKey = isViewKey(searchParams.get('view')) ? (searchParams.get('view') as ViewKey) : 'grand';
    const active = VIEWS.find(v => v.value === activeView)!;

    const handleChange = (value: string) => {
        router.push(`/fleet/transactions/ledger?view=${value}`, { scroll: false });
    };

    return (
        <div className="flex flex-col gap-6">
            <Card className="border-dashed">
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <BookOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight">Fleet Transaction Ledgers</h1>
                            <p className="text-xs text-muted-foreground">{active.description}</p>
                        </div>
                    </div>
                    <div className="space-y-1.5 w-full sm:w-64">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Viewing Ledger</Label>
                        <Select value={activeView} onValueChange={handleChange}>
                            <SelectTrigger className="h-10 bg-white font-semibold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VIEWS.map(v => (
                                    <SelectItem key={v.value} value={v.value}>
                                        <span className="flex items-center gap-2">
                                            <v.icon className="h-4 w-4" /> {v.label}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {activeView === 'grand' && <GrandLedgerView />}
            {activeView === 'purchase' && <PurchaseView />}
            {activeView === 'sales' && <SalesView />}
            {activeView === 'expenses' && <ExpensesView />}
            {activeView === 'vouchers' && <VouchersView />}
        </div>
    );
}

export default function LedgerPage() {
    return (
        <Suspense fallback={null}>
            <LedgerPageInner />
        </Suspense>
    );
}
