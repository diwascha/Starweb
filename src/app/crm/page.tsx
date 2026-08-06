
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { 
    Calculator, 
    FileSpreadsheet, 
    FileText, 
    Users, 
    Building2, 
    History, 
    TrendingUp, 
    Zap,
    PlusCircle,
    ArrowRight,
    Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import type { Party, CRMContact, InteractionLog } from '@/lib/types';
import { onPartiesUpdate } from '@/services/party-service';
import { onContactsUpdate, onInteractionsUpdate } from '@/services/crm-service';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function CrmDashboardPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Party[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [interactions, setInteractions] = useState<InteractionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
        onPartiesUpdate((data) => setCompanies(data.filter(p => p.type === 'Customer' || p.type === 'Both'))),
        onContactsUpdate(setContacts),
        onInteractionsUpdate((data) => {
            setInteractions(data);
            setIsLoading(false);
        })
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const stats = useMemo(() => ({
    totalCompanies: companies.length,
    totalContacts: contacts.length,
    recentActivity: interactions.slice(0, 5)
  }), [companies, contacts, interactions]);

  if (isLoading) return <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></div>;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">CRM Intelligence</h1>
            <p className="text-muted-foreground text-sm font-medium italic mt-1">Customer Relationship Management & Contact Data Hub.</p>
        </div>
      </header>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Partner Accounts" value={stats.totalCompanies} icon={Building2} color="blue" />
            <StatCard title="Mapped Contacts" value={stats.totalContacts} icon={Users} color="emerald" />
            <StatCard title="Active Quotes" value="-" icon={Calculator} color="amber" />
            <StatCard title="Engagement Level" value="Real-time" icon={Zap} color="purple" />
       </div>

       <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Relationship Management Core</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <ModuleCard 
                    href="/crm/companies" 
                    title="Companies & Accounts" 
                    desc="Hierarchical profiles containing deal stages and organizational data." 
                    icon={Building2} 
                />
                <ModuleCard 
                    href="/crm/contacts" 
                    title="Contact Database" 
                    desc="Centralized individual records with designations and communication logs." 
                    icon={Users} 
                />
                <ModuleCard 
                    href="/crm/cost-report/calculator" 
                    title="Costing Engine" 
                    desc="Generate technical manufacturing estimates based on board specifications." 
                    icon={Calculator} 
                />
                <ModuleCard 
                    href="/crm/pack-spec" 
                    title="PackSpec Catalog" 
                    desc="Master technical repository for all client product requirements." 
                    icon={FileText} 
                />
              </div>
          </div>

          <div className="space-y-6">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Relationship Pulse</h2>
                <Card className="shadow-sm border-gray-100 bg-white h-[400px] flex flex-col overflow-hidden">
                    <CardHeader className="bg-muted/10 border-b py-4">
                        <CardTitle className="text-xs uppercase font-black flex items-center gap-2">
                            <History className="h-4 w-4 text-primary" />
                            Recent Interactions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-4">
                                {stats.recentActivity.map(log => (
                                    <div key={log.id} className="flex gap-4 items-start group">
                                        <div className="w-1.5 h-10 rounded-full bg-primary/20 group-hover:bg-primary transition-colors" />
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase text-gray-900 tracking-tighter">{log.subject}</span>
                                                <Badge variant="outline" className="text-[7px] font-black uppercase h-3.5 px-1">{log.type}</Badge>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground line-clamp-1 italic">
                                                {companies.find(c => c.id === log.partyId)?.name}
                                            </p>
                                            <p className="text-[9px] font-bold text-primary uppercase tracking-widest pt-1">
                                                {format(new Date(log.date), "dd MMM, p")}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {stats.recentActivity.length === 0 && (
                                    <div className="py-20 text-center text-[10px] font-bold uppercase text-muted-foreground opacity-30 italic">No logged activity.</div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                    <CardFooter className="bg-muted/5 border-t p-3">
                        <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest h-8" asChild>
                            <Link href="/crm/companies">View Account History <ArrowRight className="ml-2 h-3 w-3"/></Link>
                        </Button>
                    </CardFooter>
                </Card>
          </div>
       </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
    const colors: any = {
        blue: "bg-blue-50 text-blue-600 border-blue-100",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        amber: "bg-amber-50 text-amber-600 border-amber-100",
        purple: "bg-purple-50 text-purple-600 border-purple-100"
    };
    return (
        <Card className={cn("shadow-none border-none ring-1 ring-black/5 overflow-hidden", colors[color])}>
            <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60">{title}</p>
                    <p className="text-2xl font-black leading-none tracking-tight">{value}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white shadow-inner">
                    <Icon className="h-5 w-5 opacity-80" />
                </div>
            </CardContent>
        </Card>
    );
}

function ModuleCard({ href, title, desc, icon: Icon }: any) {
    return (
        <Link href={href}>
            <Card className="h-full hover:shadow-lg transition-all border-none ring-1 ring-black/5 bg-white group hover:-translate-y-0.5">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-black uppercase tracking-wider text-gray-900 group-hover:text-primary transition-colors">{title}</CardTitle>
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardHeader>
                <CardContent>
                    <p className="text-[10px] text-muted-foreground font-medium leading-relaxed uppercase">{desc}</p>
                    <div className="mt-4 flex items-center text-[9px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Explore Module <ChevronRight className="ml-1 h-3 w-3" />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
