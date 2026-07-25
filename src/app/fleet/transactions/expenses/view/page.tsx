'use client';

import { useState, useEffect, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import { getExpense, getExpenseByVoucherNo } from '@/services/expense-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onSettingUpdate } from '@/services/settings-service';
import { getTransactions } from '@/services/transaction-service';
import type { Vehicle, Party, Account, CompanyProfile, Transaction } from '@/lib/types';
import type { Expense } from '@/lib/expense-types';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, ArrowLeft, Edit, Save } from 'lucide-react';
import { toNepaliDate, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';

/**
 * @fileOverview Dedicated detail view for Expense records.
 * Supports cross-referencing Transaction IDs to find the parent Expense record.
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
                const [vData, pData, aData, tData] = await Promise.all([
                    new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
                    new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
                    new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
                    getTransactions()
                ]);
                
                setVehicles(vData);
                setParties(pData);
                setAccounts(aData);

                // Resolution Logic: Try Expense ID then Fallback to Transaction lookup
                let eData = await getExpense(id);
                if (!eData) {
                    const matchedTxn = tData.find(t => t.id === id);
                    if (matchedTxn && matchedTxn.expenseId) {
                        eData = await getExpense(matchedTxn.expenseId);
                    } else if (matchedTxn && matchedTxn.referenceId) {
                        eData = await getExpenseByVoucherNo(matchedTxn.referenceId);
                    }
                }
                setExpense(eData);

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

    if (isLoading) return <div className="p-12 text-center flex flex-col items-center justify-center h-[70vh] gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Loading voucher details...</p></div>;
    
    if (!expense) return (
        <div className="p-12 text-center space-y-4">
            <p className="text-muted-foreground font-medium">Expense record not found or inaccessible.</p>
            <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
        </div>
    );

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
                    <Button variant="outline" size="sm" onClick={() => router.push(`/fleet/transactions/expenses/edit?id=${expense.id}`)} className="h-10 px-4 font-bold text-[10px] uppercase tracking-widest"><Edit className="mr-2 h-3.5 w-3.5"/> Edit Record</Button>
                    <Button onClick={() => window.print()} className="h-10 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20"><Printer className="mr-2 h-4 w-4"/> Print Voucher</Button>
                </div>
            </header>

            <div className="printable-area p-10 bg-white text-black border rounded-lg shadow-xl ring-1 ring-black/5">
                <header className="text-center space-y-1 mb-8">
                    <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                    {companyProfile.nameNp && <h2 className="text-lg font-semibold">{companyProfile.nameNp}</h2>}
                    <p className="text-sm font-bold text-muted-foreground">{companyProfile.address}</p>
                    <h2 className="text-lg font-black underline mt-4 uppercase tracking-[0.2em]">EXPENSE PAYMENT VOUCHER</h2>
                </header>

                <div className="grid grid-cols-2 gap-8 text-sm mb-6">
                    <div className="space-y-1.5">
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Voucher No:</span> <span className="font-black">{expense.voucherNo}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Vehicle:</span> <span className="font-bold text-blue-900">{vehicle?.name || 'N/A'}</span></p>
                        <div className="flex items-center gap-2">
                            <span className="font-bold uppercase text-[10px] text-muted-foreground">Expense Class:</span> 
                            <Badge variant="outline" className="font-black uppercase text-[10px] h-5">{expense.expenseType}</Badge>
                        </div>
                    </div>
                    <div className="text-right space-y-1.5">
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Date (BS):</span> <span className="font-black">{toNepaliDate(expense.date)}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Date (AD):</span> <span className="text-muted-foreground">{format(new Date(expense.date), "PP")}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Settlement:</span> <span className="font-bold uppercase">{expense.paymentMode}</span></p>
                    </div>
                </div>

                <Separator className="bg-neutral-900 h-0.5 mb-6" />

                <div className="space-y-8">
                    <section>
                        <Table className="border text-sm">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="h-10 hover:bg-transparent border-b-2 border-neutral-900">
                                    <TableHead className="text-neutral-900 font-black uppercase text-[10px]">Description / Beneficiary</TableHead>
                                    <TableHead className="text-right text-neutral-900 font-black uppercase text-[10px] w-[180px]">Amount (रु)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="h-14 hover:bg-transparent">
                                    <TableCell className="py-4">
                                        <div className="font-black text-gray-900 uppercase tracking-tight">{party?.name || expense.destination || 'Cash Settlement'}</div>
                                        <div className="text-[10px] text-muted-foreground italic font-medium mt-1">Ref: {expense.remarks || 'No narration provided'}</div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums font-black text-base">{(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                                {expense.extraAmount ? (
                                    <TableRow className="h-12 hover:bg-transparent text-muted-foreground italic bg-muted/5 border-t border-dashed">
                                        <TableCell className="pl-10 text-[11px]">Extra combined charge: {expense.extraRemarks || 'Logistics/Commission'}</TableCell>
                                        <TableCell className="text-right tabular-nums font-bold text-xs">{(expense.extraAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                            <TableFooter className="bg-muted/30 border-t-2 border-neutral-900">
                                <TableRow className="font-black h-12 hover:bg-transparent">
                                    <TableCell className="text-right uppercase text-[10px] tracking-widest">Total Voucher Outflow</TableCell>
                                    <TableCell className="text-right tabular-nums text-lg">Rs. {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </section>

                    <div className="grid grid-cols-2 gap-8 text-xs">
                        <div className="space-y-2 p-4 bg-muted/10 rounded-lg border border-dashed">
                            <h4 className="font-black uppercase text-[9px] text-muted-foreground tracking-widest">Authorized Source</h4>
                            {expense.paymentMode === 'Cash' ? (
                                <p className="font-black text-gray-900 uppercase">Settled via Petty Cash</p>
                            ) : (
                                <div className="space-y-1">
                                    <p className="font-black text-gray-900 uppercase">{account?.bankName || 'Cloud Synchronized Account'}</p>
                                    <p className="text-[10px] font-mono font-bold text-blue-800">A/C: {account?.accountNumber}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col justify-center">
                            <p className="font-black uppercase text-[9px] text-muted-foreground tracking-widest mb-1">Amount In Words</p>
                            <p className="font-black italic text-gray-900 leading-tight underline decoration-muted/30 underline-offset-4">{toWords(totalAmount)}</p>
                        </div>
                    </div>
                </div>

                <footer className="mt-32 grid grid-cols-2 gap-12 text-center text-[10px]">
                    <div className="space-y-3">
                        <div className="border-t-2 border-neutral-900 w-full" />
                        <p className="font-black uppercase tracking-widest">Authorized Signature</p>
                    </div>
                    <div className="space-y-3">
                        <div className="border-t-2 border-neutral-900 w-full" />
                        <p className="font-black uppercase tracking-widest">Receiver's Acknowledgement</p>
                    </div>
                </footer>
            </div>
            
            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 0.5in; }
                    body { background: #fff !important; }
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; padding: 0; margin: 0; }
                    .print\\:hidden { display: none !important; }
                }
            `}</style>
        </div>
    );
}

export default function Page(props: { params: Promise<any>, searchParams: Promise<any> }) {
    return (
        <Suspense fallback={<div className="p-12 text-center flex flex-col items-center justify-center h-[70vh] gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Initializing...</p></div>}>
            <ExpenseViewContent searchParams={props.searchParams} />
        </Suspense>
    );
}
