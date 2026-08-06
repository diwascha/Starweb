'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTrip } from '@/services/trip-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onSettingUpdate } from '@/services/settings-service';
import type { Trip, Vehicle, Party, CompanyProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, ArrowLeft, Edit, Save } from 'lucide-react';
import { toNepaliDate, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';

function TripSheetViewContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = searchParams.get('id');

    const [trip, setTrip] = useState<Trip | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
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
                const [tData, vData, pData] = await Promise.all([
                    getTrip(id),
                    new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
                    new Promise<Party[]>(resolve => onPartiesUpdate(resolve))
                ]);
                setTrip(tData);
                setVehicles(vData);
                setParties(pData);
            } catch (err) {
                console.error("Failed to load trip", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
        return onSettingUpdate('fleetCompanyProfile', (s) => {
            if (s?.value) setCompanyProfile(s.value);
        });
    }, [id]);

    if (isLoading) return <div className="p-12 text-center flex flex-col items-center gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p>Loading trip sheet...</p></div>;
    if (!trip) return <div className="p-12 text-center">Trip sheet not found.</div>;

    const vehicle = vehicles.find(v => v.id === trip.vehicleId);
    const customer = parties.find(p => p.id === trip.partyId);
    
    const totalFreight = (trip.destinations || []).reduce((sum, d) => sum + Number(d.freight), 0);
    const totalFuel = (trip.fuelEntries || []).reduce((sum, f) => sum + Number(f.amount), 0);
    const totalExtra = (trip.extraExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
    
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header className="flex justify-between items-center print:hidden bg-muted/30 p-6 rounded-2xl border border-dashed">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white shadow-sm border"><ArrowLeft className="h-5 w-5"/></Button>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight">Sales - Trip Sheet</h1>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{trip.tripNumber}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/fleet/trip-sheets/edit?id=${trip.id}`)} className="h-10 font-bold uppercase text-[10px] tracking-widest"><Edit className="mr-2 h-3.5 w-3.5"/> Edit</Button>
                    <Button onClick={() => window.print()} className="h-10 px-8 font-black text-xs uppercase tracking-widest"><Printer className="mr-2 h-4 w-4"/> Print</Button>
                </div>
            </header>

            <div className="printable-area p-10 bg-white text-black border rounded-lg shadow-xl ring-1 ring-black/5">
                <header className="text-center space-y-1 mb-8">
                    <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                    <p className="text-sm font-bold text-muted-foreground">{companyProfile.address}</p>
                    <h2 className="text-lg font-black underline mt-4 uppercase">SALES - TRIP SHEET</h2>
                </header>

                <div className="grid grid-cols-2 gap-8 text-sm mb-6">
                    <div className="space-y-1">
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Voucher No:</span> <span className="font-black">{trip.tripNumber}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Truck No:</span> <span className="font-bold">{vehicle?.name || 'N/A'}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Customer:</span> <span className="font-bold">{customer?.name || 'N/A'}</span></p>
                    </div>
                    <div className="text-right space-y-1">
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Date (BS):</span> <span className="font-bold">{toNepaliDate(trip.date)}</span></p>
                        <p><span className="font-bold uppercase text-[10px] text-muted-foreground">Date (AD):</span> <span className="text-muted-foreground">{format(new Date(trip.date), 'yyyy-MM-dd')}</span></p>
                    </div>
                </div>

                <Separator className="bg-gray-200 mb-6" />

                <div className="space-y-8">
                    <section>
                        <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">Freight & Destinations</h3>
                        <Table className="border text-xs">
                            <TableHeader className="bg-muted/50">
                                <TableRow><TableHead>Destination</TableHead><TableHead className="text-right">Freight Amount (रु)</TableHead></TableRow>
                            </TableHeader>
                            <TableBody>
                                {trip.destinations.map((d, i) => (
                                    <TableRow key={i}><TableCell className="font-bold">{d.name}</TableCell><TableCell className="text-right tabular-nums">{Number(d.freight).toLocaleString()}</TableCell></TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-muted/30">
                                <TableRow className="font-black"><TableCell className="text-right">Total Freight</TableCell><TableCell className="text-right tabular-nums">Rs. {totalFreight.toLocaleString()}</TableCell></TableRow>
                            </TableFooter>
                        </Table>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section>
                            <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">Fuel Logs</h3>
                            <Table className="border text-[10px]">
                                <TableHeader className="bg-muted/50">
                                    <TableRow><TableHead>Vendor</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
                                </TableHeader>
                                <TableBody>
                                    {trip.fuelEntries.map((f, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{parties.find(p => p.id === f.partyId)?.name || 'N/A'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{Number(f.amount).toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </section>
                        <section>
                            <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">Internal Outflows</h3>
                            <div className="p-4 bg-muted/20 border rounded-lg space-y-2 text-xs">
                                <div className="flex justify-between"><span>Truck Advance (Peski)</span><span className="font-bold">Rs. {(Number(trip.truckAdvance) || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Loading/Unloading</span><span className="font-bold">Rs. {Number(trip.transport).toLocaleString()}</span></div>
                            </div>
                        </section>
                    </div>
                </div>

                <footer className="mt-20 pt-10 border-t border-dashed border-gray-200 text-center">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase italic">Generated via StarSutra Intelligence. No physical signature required.</p>
                </footer>
            </div>
            
            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 0.5in; }
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 10px; }
                }
            `}</style>
        </div>
    );
}

export default function TripSheetViewPage() {
    return (
        <Suspense fallback={<div className="p-12 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto"/></div>}>
            <TripSheetViewContent />
        </Suspense>
    );
}
