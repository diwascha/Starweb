'use client';

import { useState, useEffect, useMemo } from 'react';
import { DollarSign, Plus, Loader2, CheckCircle2, AlertCircle, PlayCircle, History, Filter } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onAgreementsUpdate } from '@/services/agreement-service';
import { onRentalBillsUpdate, generateRentBill } from '@/services/rental-billing-service';
import type { RentalAgreement, RentalBill } from '@/lib/types';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';

export default function RentBillingPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [agreements, setAgreements] = useState<RentalAgreement[]>([]);
    const [bills, setBills] = useState<RentalBill[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const currentMonth = new NepaliDate().getMonth();
    const currentYear = new NepaliDate().getYear();

    useEffect(() => {
        onAgreementsUpdate(setAgreements);
        onRentalBillsUpdate(setBills);
    }, []);

    const pendingAgreements = useMemo(() => {
        return agreements.filter(a => {
            if (a.status !== 'Active') return false;
            // Check if a bill for this month/year already exists
            const alreadyBilled = bills.some(b => b.agreementId === a.id && b.billingMonth === currentMonth && b.billingYear === currentYear && b.type === 'Rent');
            return !alreadyBilled;
        });
    }, [agreements, bills, currentMonth, currentYear]);

    const handleGenerateBulk = async () => {
        if (!user || pendingAgreements.length === 0) return;
        setIsGenerating(true);
        try {
            let successCount = 0;
            for (const agreement of pendingAgreements) {
                await generateRentBill(agreement, currentMonth, currentYear, user.username);
                successCount++;
            }
            toast({ title: 'Billing Complete', description: `Successfully generated ${successCount} rent bills.` });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Rent Billing</h1>
                <p className="text-muted-foreground">Manage monthly recurring rental invoices.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium uppercase text-muted-foreground">Current Period</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-2xl font-black">{NEPALI_MONTHS[currentMonth].name}, {currentYear} BS</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium uppercase text-muted-foreground">Pending Bills</CardTitle></CardHeader>
                    <CardContent className="flex items-center justify-between">
                        <p className="text-2xl font-black text-amber-600">{pendingAgreements.length}</p>
                        <Button onClick={handleGenerateBulk} disabled={isGenerating || pendingAgreements.length === 0} size="sm">
                            {isGenerating ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <PlayCircle className="mr-2 h-4 w-4"/>}
                            Generate Now
                        </Button>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium uppercase text-muted-foreground">Total Value</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-2xl font-black">Rs. {pendingAgreements.reduce((sum, a) => sum + a.monthlyRent, 0).toLocaleString()}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Billing History</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Tenant</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bills.map(bill => (
                                <TableRow key={bill.id}>
                                    <TableCell className="text-xs">{new Date(bill.createdAt).toLocaleDateString()}</TableCell>
                                    <TableCell className="font-bold">{bill.unitNumber}</TableCell>
                                    <TableCell>{bill.tenantName}</TableCell>
                                    <TableCell className="text-xs uppercase">{NEPALI_MONTHS[bill.billingMonth].name} {bill.billingYear}</TableCell>
                                    <TableCell className="font-mono">Rs. {bill.amount.toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Badge variant={bill.status === 'Paid' ? 'default' : 'destructive'} className={bill.status === 'Paid' ? 'bg-green-600' : ''}>
                                            {bill.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {bills.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">No billing history found.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
