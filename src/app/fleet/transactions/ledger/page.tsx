'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, TrendingUp, Wallet, Receipt, CreditCard, Truck, Users } from 'lucide-react';
import { PurchaseView } from './_views/purchase-view';
import { SalesView } from './_views/sales-view';
import { ExpensesView } from './_views/expenses-view';
import { VouchersView } from './_views/vouchers-view';
import { GrandLedgerView } from './_views/grand-view';
import { TruckPnlView } from './_views/truck-pnl-view';
import { PartyDuesView } from './_views/party-dues-view';

const VIEWS = [
    { value: 'grand', label: 'Grand Ledger', description: 'Every transaction, all ledgers combined', icon: CreditCard },
    { value: 'purchase', label: 'Purchase', description: 'Accrued purchase-side charges (parts, credit, etc.)', icon: ShoppingCart },
    { value: 'sales', label: 'Sales (Trip Sheets)', description: 'Freight income booked per trip', icon: TrendingUp },
    { value: 'expenses', label: 'Expenses', description: 'Operational cash/bank payment outflows', icon: Wallet },
    { value: 'vouchers', label: 'Payment & Receipts', description: 'Multi-entry settlement vouchers', icon: Receipt },
    { value: 'truck-pnl', label: 'Truck P&L', description: 'Income vs. expense per truck', icon: Truck },
    { value: 'party-dues', label: 'Party Dues', description: 'Outstanding balance per party', icon: Users },
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
        <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
                <div className="flex items-center gap-2">
                    <active.icon className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs text-muted-foreground">{active.description}</p>
                </div>
                <Select value={activeView} onValueChange={handleChange}>
                    <SelectTrigger className="h-8 w-full sm:w-56 text-xs font-semibold">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {VIEWS.map(v => (
                            <SelectItem key={v.value} value={v.value}>
                                <span className="flex items-center gap-2">
                                    <v.icon className="h-3.5 w-3.5" /> {v.label}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {activeView === 'grand' && <GrandLedgerView />}
            {activeView === 'purchase' && <PurchaseView />}
            {activeView === 'sales' && <SalesView />}
            {activeView === 'expenses' && <ExpensesView />}
            {activeView === 'vouchers' && <VouchersView />}
            {activeView === 'truck-pnl' && <TruckPnlView />}
            {activeView === 'party-dues' && <PartyDuesView />}
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
