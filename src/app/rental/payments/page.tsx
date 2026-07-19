'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Receipt, Search, Save, Loader2, ArrowRight, User, Wallet, Calculator } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate } from '@/services/party-service';
import { onRentalBillsUpdate } from '@/services/rental-billing-service';
import { onAccountsUpdate } from '@/services/account-service';
import { addTransaction } from '@/services/transaction-service';
import type { Party, RentalBill, Account, Transaction } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

function PaymentCollection() {
    const searchParams = useSearchParams();
    const tenantIdFromUrl = searchParams.get('tenantId');
    
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [tenants, setTenants] = useState<Party[]>([]);
    const [bills, setBills] = useState<RentalBill[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    
    const [selectedTenantId, setSelectedTenantId] = useState(tenantIdFromUrl || '');
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank'>('Cash');
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        onPartiesUpdate(data => setTenants(data.filter(p => p.type === 'Tenant' || p.type === 'Both')));
        onRentalBillsUpdate(setBills);
        onAccountsUpdate(data => setAccounts(data.filter(a => a.ownership === 'Rental' || a.ownership === 'Both')));
    }, []);

    const tenantSummary = useMemo(() => {
        if (!selectedTenantId) return null;
        const tenantBills = bills.filter(b => b.tenantId === selectedTenantId && b.status !== 'Paid');
        const rentTotal = tenantBills.filter(b => b.type === 'Rent').reduce((sum, b) => sum + b.amount, 0);
        const utilityTotal = tenantBills.filter(b => b.type !== 'Rent').reduce((sum, b) => sum + b.amount, 0);
        return { rentTotal, utilityTotal, totalDue: rentTotal + utilityTotal };
    }, [selectedTenantId, bills]);

    const handleSavePayment = async () => {
        if (!user || !selectedTenantId || paymentAmount <= 0) return;
        if (paymentMode === 'Bank' && !selectedAccountId) {
            toast({ title: 'Select Bank Account', variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            const now = new Date().toISOString();
            const tenant = tenants.find(t => t.id === selectedTenantId);

            // Create Receipt Transaction
            const txn: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = {
                date: now,
                type: 'Receipt',
                category: 'Rent Payment',
                amount: paymentAmount,
                invoiceType: 'Normal',
                billingType: paymentMode,
                accountId: paymentMode === 'Bank' ? selectedAccountId : null,
                partyId: selectedTenantId,
                items: [{ particular: 'Rental Dues Collection', quantity: 1, rate: paymentAmount }],
                remarks: remarks || `Rent collection from ${tenant?.name}`,
                createdBy: user.username,
                referenceType: 'Rental Payment',
                ownership: tenant?.ownership || 'Rental'
            };

            await addTransaction(txn);
            toast({ title: 'Payment Recorded', description: 'Transaction synced with ledger.' });
            
            // Reset form
            setPaymentAmount(0);
            setRemarks('');
        } catch {
            toast({ title: 'Error saving payment', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Payment Collection</h1>
                <p className="text-muted-foreground">Fast receipting for tenants.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><User className="h-5 w-5"/> Select Tenant</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label>Tenant Name</Label>
                            <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                                <SelectTrigger className="h-12 text-lg"><SelectValue placeholder="Search tenant..."/></SelectTrigger>
                                <SelectContent>
                                    {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {tenantSummary && (
                            <div className="p-4 rounded-xl bg-muted/30 border space-y-3 animate-in fade-in zoom-in-95">
                                <div className="flex justify-between text-sm italic"><span>Rent Outstanding</span><span>Rs. {tenantSummary.rentTotal.toLocaleString()}</span></div>
                                <div className="flex justify-between text-sm italic"><span>Utilities / Other</span><span>Rs. {tenantSummary.utilityTotal.toLocaleString()}</span></div>
                                <Separator />
                                <div className="flex justify-between font-black text-xl text-red-600"><span>Total Outstanding</span><span>Rs. {tenantSummary.totalDue.toLocaleString()}</span></div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-primary/20 shadow-lg">
                    <CardHeader className="bg-primary/5">
                        <CardTitle className="flex items-center gap-2 text-primary"><Wallet className="h-5 w-5"/> Collection Entry</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="space-y-2">
                            <Label>Amount Received (NPR)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Rs.</span>
                                <Input type="number" className="pl-10 h-12 text-xl font-black" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <Button variant={paymentMode === 'Cash' ? 'default' : 'outline'} className="h-10" onClick={() => setPaymentMode('Cash')}>Cash</Button>
                            <Button variant={paymentMode === 'Bank' ? 'default' : 'outline'} className="h-10" onClick={() => setPaymentMode('Bank')}>Bank</Button>
                        </div>

                        {paymentMode === 'Bank' && (
                            <div className="space-y-2 animate-in slide-in-from-top-2">
                                <Label>Deposit To Account</Label>
                                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                    <SelectTrigger><SelectValue placeholder="Select Bank Account"/></SelectTrigger>
                                    <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} - {a.accountNumber}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Notes / Reference</Label>
                            <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Cheque # or payment memo" />
                        </div>
                    </CardContent>
                    <CardFooter className="bg-primary/5 border-t">
                        <Button className="w-full h-12 font-bold" onClick={handleSavePayment} disabled={isSaving || !selectedTenantId || paymentAmount <= 0}>
                            {isSaving ? <Loader2 className="animate-spin h-5 w-5 mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
                            Post Collection & Close
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}

export default function Page() {
    return <Suspense><PaymentCollection/></Suspense>;
}
