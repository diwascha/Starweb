'use client';

import { useState, useEffect, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import { getExpense } from '@/services/expense-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onSettingUpdate } from '@/services/settings-service';
import type { Vehicle, Party, Account, CompanyProfile } from '@/lib/types';
import type { Expense } from '@/lib/expense-types';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, ArrowLeft, Edit, Save } from 'lucide-react';
import { toNepaliDate, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DEFAULT_FLEET_PROFILE } from '@/lib/constants';

/**
 * @fileOverview Dedicated detail view for Expense records.
 */

function ExpenseViewContent({ searchParams }: { searchParams: Promise<any> }) {
    const router = useRouter();
    const params = use(searchParams);
    const id = params.id;

    const [expense, setExpense] = useState<Expense | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [eData, vData, pData, aData] = await Promise.all([
                    getExpense(id),
                    new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
                    new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
                    new Promise<Account[]>(resolve => onAccountsUpdate(resolve))
                ]);
                setExpense(eData);
                setVehicles(vData);
                setParties(pData);
                setAccounts(aData);
            } catch (err) {
                console.error("Failed to load expense", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
        return onSettingUpdate('fleetCompanyProfile', (s) => {
            if (s?.value) setCompanyProfile(s.value);
        });
    }, [id]);

    if (isLoading) return <div className="p-12 text-center flex flex-col items-center gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p>Loading voucher details...</p></div>;
    if (!expense) return <div className="p-12 text-center">Expense record not found.</div>;

    const vehicle = vehicles.find(v => v.id === expense.vehicleId);
    const party = parties.find(p => p.id === expense.partyId);
    const account = accounts.find(a => a.id === expense.accountId);
    const totalAmount = expense.amount + (expense.extraAmount || 0);

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header className="flex justify-between items-center print:hidden bg-muted/30 p-6 rounded-2xl border border-dashed">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white shadow-sm border"><ArrowLeft className="h-5 w-5"/></Button>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight">Expense Voucher</h1>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{expense.voucherNo}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/fleet/transactions/expenses/edit?id=${expense.id}`)} className="h-10 font-bold uppercase text-[10px] tracking-widest"><Edit className="mr-2 h-3.5 w-3.5"/> Edit</Button>
                    <Button onClick={() => window.print()} className="h-10 px-8 font-black uppercase text-[10px] tracking-widest"><Printer className="mr-2 h-4 w-4"/> Print</Button>
                </div>
            </header>

            <div className="printable-area p-10 bg-white text-black border rounded-lg shadow-xl ring-1 ring-black/5">
                <header className="text-center space-y-1 mb-8">
                    <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                    <p className="text-sm font-bold text-muted-foreground">{companyProfile.address}</p>
                    <h2 className="text-lg font-black underline mt-4 uppercase">EXPENSE PAYMENT VOUCHER</h2>
                </header>

                <div className="grid grid-cols-2 gap-8 text-sm mb-6">
                    <div className="space-y-1">
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Voucher No:</span> <span className="font-black">{expense.voucherNo}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Truck No:</span> <span className="font-bold">{vehicle?.name || 'N/A'}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Category:</span> <span className="font-bold uppercase">{expense.expenseType}</span></p>
                    </div>
                    <div className="text-right space-y-1">
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Date (BS):</span> <span className="font-bold">{toNepaliDate(expense.date)}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Settlement:</span> <Badge variant="outline" className="font-black uppercase text-[10px]">{expense.paymentMode}</Badge></p>
                    </div>
                </div>

                <Separator className="bg-gray-200 mb-6" />

                <div className="space-y-8">
                    <section>
                        <Table className="border text-sm">
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead>Particulars / Beneficiary</TableHead>
                                    <TableHead className="text-right">Amount (रु)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="h-12">
                                    <TableCell>
                                        <div className="font-bold">{party?.name || expense.destination || 'Cash Advance'}</div>
                                        {expense.remarks && <div className="text-[10px] text-muted-foreground italic">{expense.remarks}</div>}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums font-bold">{expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                                {expense.extraAmount ? (
                                    <TableRow className="h-10 text-muted-foreground">
                                        <TableCell className="pl-8 italic">Extra: {expense.extraRemarks || 'Additional charges'}</TableCell>
                                        <TableCell className="text-right tabular-nums">{(expense.extraAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                            <TableFooter className="bg-muted/30">
                                <TableRow className="font-black">
                                    <TableCell className="text-right">Total Outflow</TableCell>
                                    <TableCell className="text-right tabular-nums">Rs. {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </section>

                    <div className="grid grid-cols-2 gap-8 text-xs">
                        <div className="space-y-2 p-4 bg-muted/10 rounded-lg">
                            <h4 className="font-black uppercase text-[9px] text-muted-foreground tracking-widest">Payment Source</h4>
                            {expense.paymentMode === 'Cash' ? (
                                <p className="font-bold">Cash Payment</p>
                            ) : (
                                <div className="space-y-1">
                                    <p className="font-bold">{account?.bankName || 'Bank Account'}</p>
                                    <p className="text-[10px] font-mono">{account?.accountNumber}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col justify-end">
                            <p className="font-bold uppercase text-[9px] text-muted-foreground">In Words</p>
                            <p className="font-bold italic">{toWords(totalAmount)}</p>
                        </div>
                    </div>
                </div>

                <footer className="mt-32 grid grid-cols-2 gap-12 text-center text-[10px]">
                    <div className="space-y-2">
                        <div className="border-t border-black w-full" />
                        <p className="font-bold uppercase">Receiver's Signature</p>
                    </div>
                    <div className="space-y-2">
                        <div className="border-t border-black w-full" />
                        <p className="font-bold uppercase">Authorized By</p>
                    </div>
                </footer>
            </div>
            
            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 0.5in; }
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; padding: 0; }
                }
            `}</style>
        </div>
    );
}

export default function Page(props: { params: Promise<any>, searchParams: Promise<any> }) {
    return (
        <Suspense fallback={<div className="p-12 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto"/></div>}>
            <ExpenseViewContent searchParams={props.searchParams} />
        </Suspense>
    );
}
