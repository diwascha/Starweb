'use client';

import { useState, useEffect } from 'react';
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarSeparator,
  SidebarContent,
  useSidebar,
} from '@/components/ui/sidebar';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { FileText, LayoutDashboard, Package, FileSpreadsheet, ShoppingCart, Wrench, LogOut, Settings, Users, Calendar, Award, Wallet, Building2, PlusCircle, Truck, ShieldCheck, CreditCard, ArrowRightLeft, TrendingUp, BarChart2, Notebook, Download, Calculator, PanelLeft, PanelRight, Receipt, Briefcase, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { exportData } from '@/services/backup-service';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function SidebarCollapseButton() {
    const { state, toggleSidebar } = useSidebar();

    return (
        <Button
            variant="ghost"
            size="icon"
            className="w-full justify-center"
            onClick={toggleSidebar}
        >
            {state === 'expanded' ? <PanelLeft /> : <PanelRight />}
            <span className="sr-only">Toggle sidebar</span>
        </Button>
    )
}

const AccordionMenuTrigger = ({ children, isActive }: { children: React.ReactNode, isActive: boolean }) => (
    <AccordionTrigger className={cn(
        "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm font-medium ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        "[&[data-state=open]>svg:last-child]:rotate-180"
    )}>
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 ml-auto" />
    </AccordionTrigger>
);

export function AppSidebar() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const { state: sidebarState } = useSidebar();

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const handleExportData = async () => {
    setIsExporting(true);
    try {
        const data = await exportData();
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `starweb-backup-${new Date().toISOString()}.json`;
        link.click();
        toast({ title: 'Export Successful', description: 'Your data has been downloaded.' });
    } catch (error) {
        console.error("Export failed:", error);
        toast({ title: 'Export Failed', description: 'Could not export data.', variant: 'destructive' });
    } finally {
        setIsExporting(false);
    }
  };

  const handleSignOut = async () => {
    try {
        await logout();
        toast({ title: 'Signed Out', description: 'You have been successfully signed out.'});
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to sign out.', variant: 'destructive'});
    }
  };

  const getIsActive = (path: string, exact: boolean = false) => {
    if (!isClient) return false;
    if (exact) return pathname === path;
    return pathname.startsWith(path) && (pathname[path.length] === '/' || pathname.length === path.length);
  };
  
  const getActiveAccordionItem = () => {
    if (getIsActive('/finance')) return 'finance';
    if (getIsActive('/reports') || getIsActive('/products')) return 'reports';
    if (getIsActive('/purchase-orders') || getIsActive('/raw-materials')) return 'purchase-orders';
    if (getIsActive('/crm')) return 'crm';
    if (getIsActive('/hr')) return 'hr';
    if (getIsActive('/fleet')) return 'fleet';
    return '';
  };
  
  if (!user) {
    return null;
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">STARWEB</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
            {hasPermission('dashboard', 'view') && (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={getIsActive('/dashboard', true)}>
                <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            )}
        </SidebarMenu>
        
        <Accordion type="single" collapsible defaultValue={getActiveAccordionItem()} className="w-full">
            {hasPermission('finance', 'view') && (
                <AccordionItem value="finance" className="border-b-0">
                    <AccordionMenuTrigger isActive={getIsActive('/finance')}>
                        <Calculator />
                        <span className={cn(sidebarState === 'collapsed' && 'hidden')}>Finance</span>
                    </AccordionMenuTrigger>
                    <AccordionContent className="ml-4">
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/finance/estimate-invoice')}>
                                <Link href="/finance/estimate-invoice"><FileText /><span>Estimate Invoice</span></Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/finance/tds-calculator')}>
                                <Link href="/finance/tds-calculator"><Calculator /><span>TDS Calculator</span></Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/finance/cheque-generator')}>
                                <Link href="/finance/cheque-generator"><Receipt /><span>Cheque Generator</span></Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </AccordionContent>
                </AccordionItem>
            )}

            {(hasPermission('reports', 'view') || hasPermission('products', 'view')) && (
                 <AccordionItem value="reports" className="border-b-0">
                    <AccordionMenuTrigger isActive={getIsActive('/reports') || getIsActive('/products')}>
                        <FileText />
                        <span className={cn(sidebarState === 'collapsed' && 'hidden')}>Test Report Mgmt</span>
                    </AccordionMenuTrigger>
                    <AccordionContent className="ml-4">
                        <SidebarMenu>
                            {hasPermission('reports', 'create') && (
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/report/new', true)}><Link href="/report/new"><PlusCircle /><span>New QT Reports</span></Link></SidebarMenuButton>
                                </SidebarMenuItem>
                            )}
                            {hasPermission('reports', 'view') && (
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/reports/list')}><Link href="/reports/list"><FileSpreadsheet /><span>QT Reports Database</span></Link></SidebarMenuButton>
                                </SidebarMenuItem>
                            )}
                            {hasPermission('products', 'view') && (
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/products')}><Link href="/products"><Package /><span>QT Products</span></Link></SidebarMenuButton>
                                </SidebarMenuItem>
                            )}
                        </SidebarMenu>
                    </AccordionContent>
                </AccordionItem>
            )}
            
            {(hasPermission('purchaseOrders', 'view') || hasPermission('rawMaterials', 'view')) && (
                 <AccordionItem value="purchase-orders" className="border-b-0">
                    <AccordionMenuTrigger isActive={getIsActive('/purchase-orders') || getIsActive('/raw-materials')}>
                        <ShoppingCart />
                        <span className={cn(sidebarState === 'collapsed' && 'hidden')}>Purchase Order Mgmt</span>
                    </AccordionMenuTrigger>
                    <AccordionContent className="ml-4">
                       <SidebarMenu>
                            {hasPermission('purchaseOrders', 'view') && (
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/purchase-orders/list')}><Link href="/purchase-orders/list"><FileSpreadsheet /><span>Purchase Orders</span></Link></SidebarMenuButton>
                                </SidebarMenuItem>
                            )}
                            {hasPermission('rawMaterials', 'view') && (
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/raw-materials')}><Link href="/raw-materials"><Wrench /><span>Raw Materials</span></Link></SidebarMenuButton>
                                </SidebarMenuItem>
                            )}
                        </SidebarMenu>
                    </AccordionContent>
                </AccordionItem>
            )}

            {hasPermission('crm', 'view') && (
                 <AccordionItem value="crm" className="border-b-0">
                    <AccordionMenuTrigger isActive={getIsActive('/crm')}>
                        <Briefcase />
                        <span className={cn(sidebarState === 'collapsed' && 'hidden')}>CRM</span>
                    </AccordionMenuTrigger>
                    <AccordionContent className="ml-4">
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/crm/cost-report')}><Link href="/crm/cost-report"><Calculator /><span>Cost Report</span></Link></SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/crm/pack-spec')}><Link href="/crm/pack-spec"><FileText /><span>PackSpec</span></Link></SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </AccordionContent>
                </AccordionItem>
            )}
        
            <AccordionItem value="hr" className="border-b-0">
                <AccordionMenuTrigger isActive={getIsActive('/hr')}>
                    <Building2 />
                    <span className={cn(sidebarState === 'collapsed' && 'hidden')}>HRMS</span>
                </AccordionMenuTrigger>
                <AccordionContent className="ml-4">
                    <SidebarMenu>
                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/hr/employees')}><Link href="/hr/employees"><Users /><span>Employees</span></Link></SidebarMenuButton></SidebarMenuItem>
                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/hr/attendance')}><Link href="/hr/attendance"><Calendar /><span>Attendance</span></Link></SidebarMenuButton></SidebarMenuItem>
                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/hr/analytics')}><Link href="/hr/analytics"><BarChart2 /><span>Analytics</span></Link></SidebarMenuButton></SidebarMenuItem>
                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/hr/payroll')}><Link href="/hr/payroll"><FileText /><span>Payroll</span></Link></SidebarMenuButton></SidebarMenuItem>
                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/hr/bonus')}><Link href="/hr/bonus"><Award /><span>Bonus</span></Link></SidebarMenuButton></SidebarMenuItem>
                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/hr/payslip')}><Link href="/hr/payslip"><Wallet /><span>Payslip</span></Link></SidebarMenuButton></SidebarMenuItem>
                    </SidebarMenu>
                </AccordionContent>
            </AccordionItem>
            
            {hasPermission('fleet', 'view') && (
                <AccordionItem value="fleet" className="border-b-0">
                    <AccordionMenuTrigger isActive={getIsActive('/fleet')}>
                        <Truck />
                        <span className={cn(sidebarState === 'collapsed' && 'hidden')}>Fleet Management</span>
                    </AccordionMenuTrigger>
                    <AccordionContent className="ml-4">
                       <SidebarMenu>
                            <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/vehicles')}><Link href="/fleet/vehicles"><Truck /><span>Vehicles</span></Link></SidebarMenuButton></SidebarMenuItem>
                            <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/drivers')}><Link href="/fleet/drivers"><Users /><span>Drivers</span></Link></SidebarMenuButton></SidebarMenuItem>
                            <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/policies')}><Link href="/fleet/policies"><ShieldCheck /><span>Policies & Memberships</span></Link></SidebarMenuButton></SidebarMenuItem>
                            <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/transactions')}><Link href="/fleet/transactions"><CreditCard /><span>Transactions</span></Link></SidebarMenuButton></SidebarMenuItem>
                            <div className="ml-4">
                                <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/parties')}><Link href="/fleet/parties"><Users /><span>Party Ledger</span></Link></SidebarMenuButton></SidebarMenuItem>
                                <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/trip-sheets')}><Link href="/fleet/trip-sheets"><FileText /><span>Sales - Trip Sheet</span></Link></SidebarMenuButton></SidebarMenuItem>
                                {hasPermission('fleet', 'create') && (
                                    <div className="ml-4">
                                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/trip-sheets/new')}><Link href="/fleet/trip-sheets/new"><TrendingUp /><span>Sales Entry</span></Link></SidebarMenuButton></SidebarMenuItem>
                                    </div>
                                )}
                                {hasPermission('fleet', 'create') && (
                                    <>
                                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/transactions/purchase/new')}><Link href="/fleet/transactions/purchase/new"><ShoppingCart /><span>Purchase</span></Link></SidebarMenuButton></SidebarMenuItem>
                                        <SidebarMenuItem><SidebarMenuButton asChild isActive={getIsActive('/fleet/transactions/payment-receipt/new')}><Link href="/fleet/transactions/payment-receipt/new"><ArrowRightLeft /><span>Payment / Receipt</span></Link></SidebarMenuButton></SidebarMenuItem>
                                    </>
                                )}
                            </div>
                        </SidebarMenu>
                    </AccordionContent>
                </AccordionItem>
            )}
        </Accordion>
        
        <SidebarMenu>
            <SidebarSeparator />
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={getIsActive('/notes')}>
                    <Link href="/notes">
                        <Notebook />
                        <span>Notes & Todos</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
       <SidebarFooter>
        <SidebarMenu>
            <SidebarSeparator />
            <SidebarMenuItem>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={handleExportData} disabled={isExporting}>
                    {isExporting ? <Loader2 className="animate-spin" /> : <Download />}
                    <span>{isExporting ? 'Backing up...' : 'Backup Data'}</span>
                </Button>
            </SidebarMenuItem>
            {hasPermission('settings', 'view') && (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={getIsActive('/settings')}>
                <Link href="/settings">
                    <Settings />
                    <span>Settings</span>
                </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            )}
        </SidebarMenu>
        <SidebarSeparator />
         <div className="flex flex-col gap-2 p-2 text-sm">
            <p className="font-medium text-sidebar-foreground truncate">{user.username}</p>
         </div>
        <SidebarMenuItem>
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
            </Button>
        </SidebarMenuItem>
        <SidebarSeparator />
         <SidebarMenuItem>
            <SidebarCollapseButton />
        </SidebarMenuItem>
      </SidebarFooter>
    </Sidebar>
  );
}
