'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Scale, Ruler, Calculator, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function GsmCalculatorPage() {
    const router = useRouter();
    const [unit, setUnit] = useState<'cm' | 'in'>('cm');
    const [weight, setWeight] = useState<number | ''>('');
    const [length, setLength] = useState<number | ''>('');
    const [width, setWidth] = useState<number | ''>('');

    const gsmResult = useMemo(() => {
        if (!weight || !length || !width) return null;
        
        const w = Number(weight);
        const l = Number(length);
        const wd = Number(width);

        if (l <= 0 || wd <= 0) return 0;

        if (unit === 'cm') {
            // GSM = (Weight (g) * 10,000) / (Length (cm) * Width (cm))
            return (w * 10000) / (l * wd);
        } else {
            // GSM = (Weight (g) * 1,550) / (Length (in) * Width (in))
            return (w * 1550) / (l * wd);
        }
    }, [unit, weight, length, width]);

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
            <header className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">GSM Calculator</h1>
                    <p className="text-muted-foreground text-sm">Calculate Paper Grammage (GSM) from sample weight and size.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <Card className="shadow-lg border-primary/20">
                    <CardHeader className="bg-primary/5 border-b">
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                            <Calculator className="h-4 w-4 text-primary" />
                            Input Parameters
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Dimension System</Label>
                            <RadioGroup 
                                value={unit} 
                                onValueChange={(v: any) => setUnit(v)} 
                                className="flex gap-4 p-2 bg-muted/30 rounded-lg border border-dashed"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="cm" id="unit-cm" />
                                    <Label htmlFor="unit-cm" className="text-xs font-bold cursor-pointer">Metric (cm)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="in" id="unit-in" />
                                    <Label htmlFor="unit-in" className="text-xs font-bold cursor-pointer">Imperial (inches)</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Sample Weight (grams)</Label>
                                <div className="relative">
                                    <Scale className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                                    <Input 
                                        type="number" 
                                        value={weight} 
                                        onChange={e => setWeight(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                        placeholder="0.00"
                                        className="pl-10 h-11 font-black text-lg"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Length ({unit})</Label>
                                    <div className="relative">
                                        <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                                        <Input 
                                            type="number" 
                                            value={length} 
                                            onChange={e => setLength(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                            placeholder="0.0"
                                            className="pl-10 h-11 font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Width ({unit})</Label>
                                    <div className="relative">
                                        <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50 rotate-90" />
                                        <Input 
                                            type="number" 
                                            value={width} 
                                            onChange={e => setWidth(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                            placeholder="0.0"
                                            className="pl-10 h-11 font-bold"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="bg-primary/5 border-primary/20 shadow-none border-l-4 border-l-primary overflow-hidden">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Calculation Result</CardTitle>
                        </CardHeader>
                        <CardContent className="py-8 text-center space-y-2">
                            {gsmResult !== null ? (
                                <>
                                    <div className="text-5xl font-black text-gray-900 tracking-tighter">
                                        {gsmResult.toFixed(2)}
                                    </div>
                                    <p className="text-xs font-black uppercase text-muted-foreground tracking-[0.3em]">Grams Per Square Meter</p>
                                </>
                            ) : (
                                <div className="py-4">
                                    <p className="text-muted-foreground italic text-sm">Enter weight and dimensions to calculate GSM</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-muted/10 border-none shadow-none ring-1 ring-black/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Applied Formula</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 bg-white rounded-lg border border-dashed font-mono text-[11px] space-y-2">
                                <p className="font-bold text-primary">System: {unit === 'cm' ? 'Metric (CM)' : 'Imperial (IN)'}</p>
                                {unit === 'cm' ? (
                                    <code className="block">GSM = (Weight × 10,000) / (Length_cm × Width_cm)</code>
                                ) : (
                                    <code className="block">GSM = (Weight × 1,550) / (Length_in × Width_in)</code>
                                )}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                                This tool provides a mathematical estimation of grammage. For technical quality reports, please use standardized laboratory samples.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
