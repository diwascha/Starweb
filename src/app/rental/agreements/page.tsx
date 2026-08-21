'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Plus, 
    Search, 
    MoreHorizontal, 
    Trash2, 
    User, 
    Home, 
    Loader2, 
    FilterX,
    ChevronRight,
    ArrowRight,
    Ban,
    Briefcase
} from 'lucide-react';
import type { RentalAgreement } from '@/lib/types';
import { onAgreementsUpdate, terminateAgreement, deleteAgreement } from '@/services/agreement-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn, toNepaliDate } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { differenceInDays, isPast, isFuture, startOfToday } from 'date-fns';
import Link from 'next/link';

export default function AgreementsPage() {
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();
    
    const [agreements, setAgreements] = useState<RentalAgreement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('Active');
    
    const [terminatingAgreement, setTerminatingAgreement] = useState<RentalAgreement | null>(null);
    const [deletingAgreement, setDeletingAgreement] = useState<RentalAgreement | null>(null);

    useEffect(() => {
        setIsLoading(true);
        const unsub = onAgreementsUpdate((data) => {
            setAgreements(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    const filteredAgreements = useMemo(() => {
        return agreements.filter(a => {
            const matchesSearch = (a.tenantName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                                (a.propertyName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (a.unitNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'All' || a.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [agreements, searchQuery, statusFilter]);

    const handleTerminate = async () => {
        if (!terminatingAgreement || !user) return;
        try {
            await terminateAgreement(terminatingAgreement.id, terminatingAgreement.unitId, user.username);
            toast({ title: 'Lease Terminated', description: 'The unit has been marked as vacant.' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setTerminatingAgreement(null);
        }
    };

    const handleDelete = async () => {
        if (!deletingAgreement) return;
        try {
            await deleteAgreement(deletingAgreement.id);
            toast({ title: 'Record Removed' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setDeletingAgreement(null);
        }
    };

    const getLeaseProgress = (start: string, end: string) => {
        const today = startOfToday();
        const startDate = new Date(start);
        const endDate = new Date(end);
        
        if (isPast(endDate)) return 100;
        if (isFuture(startDate)) return 0;
        
        const total = differenceInDays(endDate, startDate);
        const elapsed = differenceInDays(today, startDate);
        if (total <= 0) return 100;
        return Math.min(100, Math.max(0, (elapsed / total) * 100));
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Active': return <Badge className="bg-emerald-600 hover:bg-emerald-700 font-black text-[9px] uppercase tracking-wider h-5 px-2">Active</Badge>;
            case 'Terminated': return <Badge variant="destructive" className="font-black text-[9px] uppercase tracking-wider h-5 px-2">Terminated</Badge>;
            case 'Pending': return <Badge variant="secondary" className="font-black text-[9px] uppercase tracking-wider h-5 px-2">Pending</Badge>;
            default: return <Badge variant="outline" className="font-black text-[9px] uppercase tracking-wider h-5 px-2">{status}</Badge>;
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Lease Ledger</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Consolidated registry of all rental contracts and tenure metrics.</p>
                </div>
                {hasPermission('rental', 'create') && (
                    <Button asChild className="h-10 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6">
                        <Link href="/rental/agreements/new">
                            <Plus className="mr-2 h-4 w-4" /> New Agreement
                        </Link>
                    </Button>
                )}
            </header>

            <div className="flex flex-col sm:flex-row gap-4 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] px-1">Global Query</Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter by tenant, property or unit..." 
                            className="pl-8 h-9 text-xs bg-white border-gray-200" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="space-y-1.5 w-[160px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] px-1">Lease Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 bg-white text-xs font-bold uppercase border-gray-200">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Records</SelectItem>
                            <SelectItem value="Active">Active Only</SelectItem>
                            <SelectItem value="Terminated">Terminated</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {(searchQuery || statusFilter !== 'Active') && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setStatusFilter('Active'); }} className="h-9 text-muted-foreground font-black text-[9px] uppercase tracking-widest">
                        <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear filters
                    </Button>
                )}
            </div>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50 border-b">
                            <TableRow className="hover:bg-transparent h-11">
                                <TableHead className="pl-6 font-black uppercase text-[10px] tracking-[0.2em] text-muted-foreground">Tenant Entity</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-[0.2em] text-muted-foreground">Space / Asset</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-[0.2em] text-muted-foreground text-center">Lifecycle</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-[0.2em] text-muted-foreground text-right">Rent / Mo</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-[0.2em] text-muted-foreground text-center">Duration (BS)</TableHead>
                                <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-[0.2em] text-muted-foreground">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="py-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                            ) : filteredAgreements.map((a) => (
                                <TableRow key={a.id} className="hover:bg-muted/10 h-16 transition-colors border-b last:border-0 group">
                                    <TableCell className="pl-6">
                                        <div className="flex flex-col">
                                            <span className="font-black text-gray-900 leading-tight uppercase tracking-tight group-hover:text-primary transition-colors">{a.tenantName}</span>
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">ID: {a.id.substring(0,8).toUpperCase()}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-primary/5 rounded-lg"><Home className="h-3.5 w-3.5 text-primary opacity-50"/></div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-gray-700 uppercase">Unit {a.unitNumber}</span>
                                                <span className="text-[9px] text-muted-foreground uppercase font-black">{a.propertyName}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col items-center gap-1.5">
                                            {getStatusBadge(a.status)}
                                            {a.status === 'Active' && (
                                                <div className="w-24 space-y-1">
                                                    <Progress value={getLeaseProgress(a.startDate, a.endDate)} className="h-1 shadow-inner" />
                                                    <p className="text-[8px] font-black uppercase text-muted-foreground text-center tracking-tighter">
                                                        {Math.round(getLeaseProgress(a.startDate, a.endDate))}% TENURE
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-black tabular-nums text-blue-700">Rs. {a.monthlyRent.toLocaleString()}</TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col">
                                            <span className="font-mono text-[11px] text-gray-900 font-bold">{toNepaliDate(a.startDate)}</span>
                                            <span className="font-mono text-[9px] text-muted-foreground uppercase font-black">UNTIL {toNepaliDate(a.endDate)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56">
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href={`/rental/tenants?search=${a.tenantName}`} className="flex items-center">
                                                        <User className="mr-2 h-4 w-4" /> Profile Details
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href={`/rental/payments?tenantId=${a.tenantId}`} className="flex items-center">
                                                        <Briefcase className="mr-2 h-4 w-4 text-emerald-600" /> Collect Dues
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onSelect={() => setTerminatingAgreement(a)} className="text-orange-600 font-bold" disabled={a.status !== 'Active'}>
                                                    <Ban className="mr-2 h-4 w-4" /> Terminate Tenure
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => setDeletingAgreement(a)} className="text-destructive">
                                                    <Trash2 className="mr-2 h-4 w-4" /> Purge History
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && filteredAgreements.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="h-60 text-center text-muted-foreground italic uppercase font-black text-[10px] tracking-widest opacity-20">No matching lease records in database.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Termination Confirm */}
            <AlertDialog open={!!terminatingAgreement} onOpenChange={(o) => !o && setTerminatingAgreement(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="uppercase tracking-tight font-black">Finalize Termination?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will immediately terminate the lease for <span className="font-bold text-gray-900">{terminatingAgreement?.tenantName}</span>. The associated unit <span className="font-bold text-gray-900">{terminatingAgreement?.unitNumber}</span> will be returned to 'Vacant' status in the inventory.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-bold text-xs uppercase tracking-widest">Abort</AlertDialogCancel>
                        <AlertDialogAction onClick={handleTerminate} className="bg-orange-600 text-white hover:bg-orange-700 font-black text-xs uppercase tracking-widest">Execute Termination</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Confirm */}
            <AlertDialog open={!!deletingAgreement} onOpenChange={(o) => !o && setDeletingAgreement(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="uppercase tracking-tight text-destructive font-black">Purge Audit Record?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action is permanent and destroys the contract lifecycle record for this instance. This should only be used to correct system anomalies or testing data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-bold text-xs uppercase tracking-widest">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90 font-black text-xs uppercase tracking-widest shadow-xl shadow-destructive/20">Purge Data</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
