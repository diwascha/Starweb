
'use client';

import { useState, useMemo } from 'react';
import { 
    Calculator, 
    PlayCircle, 
    Loader2, 
    CheckCircle2, 
    ShieldAlert,
    Clock,
    History,
    FileText,
    ArrowRight
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { runHourlyCalculation } from '@/services/attendance-service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';

export default function HourlyCalculationPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [isCalculating, setIsCalculating] = useState(false);
    const [selectedYear, setSelectedYear] = useState<string>(String(new NepaliDate().getYear()));
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new NepaliDate().getMonth()));

    const handleRunCalculation = async () => {
        if (!user) return;
        setIsCalculating(true);
        try {
            const { processed } = await runHourlyCalculation(
                parseInt(selectedYear),
                parseInt(selectedMonth),
                user.username
            );
            toast({ 
                title: 'Calculation Successful', 
                description: `Successfully processed ${processed} attendance records with configured hourly rules.` 
            });
            router.push('/hr/attendance'); // Move to the registry to see results
        } catch (error: any) {
            toast({ title: 'Calculation Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsCalculating(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><Calculator className="h-6 w-6 text-primary"/></div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Hourly Calculation Logic</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Apply HR Operational Rules to raw machine data to generate labor metrics.</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <div className="md:col-span-7 space-y-6">
                    <Card className="shadow-lg border-primary/20 overflow-hidden ring-4 ring-primary/5">
                        <CardHeader className="bg-primary/5 border-b py-6 px-8">
                            <CardTitle className="text-lg font-black uppercase text-gray-900 tracking-wider">Execute Processor</CardTitle>
                            <CardDescription className="text-xs uppercase font-bold text-muted-foreground">Select period to transform raw logs into work hours.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Target BS Year</Label>
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger className="h-11 bg-white border-2 font-bold"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[2080, 2081, 2082].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Target BS Month</Label>
                                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                        <SelectTrigger className="h-11 bg-white border-2 font-bold"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-100 flex gap-4">
                                <ShieldAlert className="h-5 w-5 text-blue-600 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-blue-900">Important Processing Rule</p>
                                    <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                                        Running this calculation will **overwrite** any existing processed attendance records for the selected period. Ensure your "HR Office" rules are correctly set before proceeding.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-muted/30 border-t py-6 px-8 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <History className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Logic Source: HR Config</span>
                            </div>
                            <Button onClick={handleRunCalculation} disabled={isCalculating} size="lg" className="h-12 px-10 font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20">
                                {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlayCircle className="mr-2 h-4 w-4"/>}
                                {isCalculating ? 'Processing...' : 'Run Logic Engine'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                <div className="md:col-span-5 space-y-6">
                    <Card className="shadow-sm border-gray-100 h-full">
                        <CardHeader className="py-5 px-6 border-b bg-muted/5">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Active Operational Rules</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            {[
                                { label: 'Standard Day', value: '8.0 Hours', icon: Clock },
                                { label: 'Rounding Logic', value: '30m Blocks', icon: History },
                                { label: 'Overtime Trigger', value: 'After 8.5 Hrs', icon: Calculator },
                                { label: 'Holiday Multiplier', value: '1.0x (Standard)', icon: FileText },
                            ].map((rule, i) => (
                                <div key={i} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-gray-100 rounded-lg group-hover:bg-primary/10 transition-colors"><rule.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary"/></div>
                                        <span className="text-xs font-bold text-gray-700">{rule.label}</span>
                                    </div>
                                    <Badge variant="secondary" className="text-[9px] uppercase font-black px-2">{rule.value}</Badge>
                                </div>
                            ))}
                            <Separator className="border-dashed" />
                            <Button variant="ghost" onClick={() => router.push('/hr/office')} className="w-full h-8 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5">
                                Modify Rules in HR Office <ArrowRight className="ml-2 h-3 w-3" />
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
