'use client';

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
  SidebarGroupLabel,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { 
  FileText, 
  LayoutDashboard, 
  Package, 
  FileSpreadsheet, 
  ShoppingCart, 
  Wrench, 
  LogOut, 
  Settings, 
  Users, 
  Calendar, 
  Award, 
  Wallet, 
  Building2, 
  PlusCircle, 
  Truck, 
  ShieldCheck, 
  CreditCard, 
  ArrowRightLeft, 
  TrendingUp, 
  BarChart2, 
  Notebook, 
  Download, 
  Calculator, 
  PanelLeft, 
  PanelRight, 
  Receipt, 
  Briefcase,
  ChevronRight,
  Home,
  HardDrive,
  Settings2,
  Terminal,
  ShieldAlert,
  Server
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { exportData } from '@/services/backup-service';
import { Loader2 } from 'lucide-react';
import { useConnectionStatus } from '@/firebase';
import { useState, useEffect } from 'react';
import { getNormalizedPath } from '@/lib/utils';
import { onSettingUpdate } from '@/services/settings-service';
import type { AppBranding } from '@/lib/types';
import logo from '@/app/signup/StarSutra.png';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

function ConnectionStatusIndicator() {
  const isConnected = useConnectionStatus();

  return (
    <div className="flex items-center gap-1.5 text-[9px] font-bold shrink-0">
      {isConnected ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
          </span>
          <span className="text-green-600 uppercase tracking-tighter">Online</span>
        </>
      ) : (
        <>
           <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
          </span>
          <span className="text-red-600 uppercase tracking-tighter">Offline</span>
        </>
      )}
    </div>
  );
}


export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, hasPermission } = useAuth();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });

  useEffect(() => {
    const unsubBranding = onSettingUpdate('appBranding', (s) => {
        if (s?.value) setAppBranding(s.value);
    });
    return () => unsubBranding();
  }, []);
  
  const handleExportData = async () => {
    setIsExporting(true);
    try {
        const data = await exportData();
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `starsutra-backup-${new Date().toISOString()}.json`;
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
    const normalizedPath = getNormalizedPath(pathname);
    const normalizedTarget = getNormalizedPath(path);

    if (exact) return normalizedPath === normalizedTarget;
    return normalizedPath.startsWith(normalizedTarget) && 
           (normalizedPath[normalizedTarget.length] === '/' || normalizedPath.length === normalizedTarget.length);
  };
  
  if (!user) {
    return null;
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-2">
            <img src={logo.src} width="28" height="28" alt="Logo" className="rounded-md group-data-[collapsible=icon]:mx-auto object-contain bg-white" />
            <h1 className="text-lg font-black tracking-tighter group-data-[collapsible=icon]:hidden truncate text-gray-900">
                {appBranding.appName}
            </h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
            {hasPermission('dashboard', 'view') && (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={getIsActive('/dashboard', true)} tooltip="Dashboard">
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <LayoutDashboard />
                        <span>Dashboard</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            )}
        </SidebarMenu>
        
        {hasPermission('finance', 'view') && (
            <Collapsible asChild defaultOpen={getIsActive('/finance')} className="group/collapsible">
                <SidebarMenu>
                    <SidebarSeparator />
                    <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip="Finance" isActive={getIsActive('/finance')}>
                                <Calculator />
                                <span>Finance</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/finance', true)}><Link href="/finance" className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/finance/estimate-invoice')}><Link href="/finance/estimate-invoice" className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>Estimate Invoice</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/finance/tds-calculator')}><Link href="/finance/tds-calculator" className="flex items-center gap-2"><Calculator className="h-4 w-4" /><span>TDS Calculator</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/finance/cheque-generator')}><Link href="/finance/cheque-generator" className="flex items-center gap-2"><Receipt className="h-4 w-4" /><span>Cheque Generator</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </SidebarMenu>
            </Collapsible>
        )}

        {(hasPermission('reports', 'view') || hasPermission('products', 'view')) && (
            <Collapsible asChild defaultOpen={getIsActive('/reports') || getIsActive('/report') || getIsActive('/products')} className="group/collapsible">
                <SidebarMenu>
                    <SidebarSeparator />
                    <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip="Test Report Management" isActive={getIsActive('/reports')}>
                                <FileText />
                                <span>Test Report Management</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/reports', true)}><Link href="/reports" className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                {hasPermission('reports', 'create') && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={getIsActive('/report/new', true)}><Link href="/report/new" className="flex items-center gap-2"><PlusCircle className="h-4 w-4" /><span>New QT Reports</span></Link></SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                                {hasPermission('reports', 'view') && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={getIsActive('/reports/list')}><Link href="/reports/list" className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /><span>QT Reports Database</span></Link></SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                                {hasPermission('products', 'view') && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={getIsActive('/products')}><Link href="/products" className="flex items-center gap-2"><Package className="h-4 w-4" /><span>QT Products</span></Link></SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </SidebarMenu>
            </Collapsible>
        )}
        
        {(hasPermission('purchaseOrders', 'view') || hasPermission('rawMaterials', 'view')) && (
            <Collapsible asChild defaultOpen={getIsActive('/purchase-orders') || getIsActive('/raw-materials')} className="group/collapsible">
                <SidebarMenu>
                    <SidebarSeparator />
                    <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip="Purchase Order Management" isActive={getIsActive('/purchase-orders')}>
                                <ShoppingCart />
                                <span>Purchase Order Management</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/purchase-orders', true)}><Link href="/purchase-orders" className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                {hasPermission('purchaseOrders', 'create') && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={getIsActive('/purchase-orders/new')}>
                                            <Link href="/purchase-orders/new" className="flex items-center gap-2">
                                                <PlusCircle className="h-4 w-4 text-amber-600" />
                                                <span>New PO</span>
                                            </Link>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                                {hasPermission('purchaseOrders', 'view') && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={getIsActive('/purchase-orders/list')}><Link href="/purchase-orders/list" className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /><span>Purchase Orders</span></Link></SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                                {hasPermission('rawMaterials', 'view') && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={getIsActive('/raw-materials')}><Link href="/raw-materials" className="flex items-center gap-2"><Wrench className="h-4 w-4" /><span>Raw Materials</span></Link></SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </SidebarMenu>
            </Collapsible>
        )}

        {hasPermission('crm', 'view') && (
            <Collapsible asChild defaultOpen={getIsActive('/crm')} className="group/collapsible">
                <SidebarMenu>
                    <SidebarSeparator />
                    <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip="CRM" isActive={getIsActive('/crm')}>
                                <Briefcase />
                                <span>CRM</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/crm', true)}><Link href="/crm" className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/crm/cost-report')}><Link href="/crm/cost-report" className="flex items-center gap-2"><Calculator className="h-4 w-4" /><span>CRM Calc</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/crm/pack-spec')}><Link href="/crm/pack-spec" className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>PackSpec</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </SidebarMenu>
            </Collapsible>
        )}
    
        {hasPermission('hr', 'view') && (
            <Collapsible asChild defaultOpen={getIsActive('/hr')} className="group/collapsible">
                <SidebarMenu>
                    <SidebarSeparator />
                    <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip="HRMS" isActive={getIsActive('/hr')}>
                                <Building2 />
                                <span>HRMS</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/hr', true)}><Link href="/hr" className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/hr/employees')}><Link href="/hr/employees" className="flex items-center gap-2"><Users className="h-4 w-4" /><span>Employees</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                
                                <SidebarGroupLabel className="px-3 py-1 text-[9px] uppercase font-black opacity-50">Attendance</SidebarGroupLabel>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/hr/attendance/raw')}><Link href="/hr/attendance/raw" className="flex items-center gap-2"><HardDrive className="h-3.5 w-3.5" /><span>Machine Logs</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/hr/office')}><Link href="/hr/office" className="flex items-center gap-2"><Settings2 className="h-4 w-4" /><span>HR Office Hub</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/hr/attendance', true)}><Link href="/hr/attendance" className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /><span>Registry</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                
                                <SidebarGroupLabel className="px-3 py-1 text-[9px] uppercase font-black opacity-50">Financials</SidebarGroupLabel>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/hr/payroll')}><Link href="/hr/payroll" className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>Workforce Ledger</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </SidebarMenu>
            </Collapsible>
        )}
        
        {hasPermission('fleet', 'view') && (
            <Collapsible asChild defaultOpen={getIsActive('/fleet')} className="group/collapsible">
                <SidebarMenu>
                    <SidebarSeparator />
                    <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip="Fleet Management" isActive={getIsActive('/fleet')}>
                                <Truck />
                                <span>Fleet Management</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={getIsActive('/fleet', true)}><Link href="/fleet" className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/fleet/registry')}><Link href="/fleet/registry" className="flex items-center gap-2"><Truck className="h-4 w-4" /><span>Vehicles & Drivers</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/fleet/policies')}><Link href="/fleet/policies" className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /><span>Policies & Memberships</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                            </SidebarMenuSub>

                            {hasPermission('fleet', 'create') && (
                                <>
                                    <SidebarGroupLabel className="px-5 py-2 text-[10px] uppercase text-muted-foreground font-bold">Data Entry</SidebarGroupLabel>
                                    <SidebarMenuSub>
                                        <SidebarMenuSubItem>
                                            <SidebarMenuSubButton asChild isActive={getIsActive('/fleet/trip-sheets/new')}><Link href="/fleet/trip-sheets/new" className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /><span>Sales Entry</span></Link></SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                        <SidebarMenuSubItem>
                                            <SidebarMenuSubButton asChild isActive={getIsActive('/fleet/transactions/expenses/new')}><Link href="/fleet/transactions/expenses/new" className="flex items-center gap-2"><Wallet className="h-4 w-4" /><span>Expense Entry</span></Link></SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                        <SidebarMenuSubItem>
                                            <SidebarMenuSubButton asChild isActive={getIsActive('/fleet/transactions/payment-receipt/new')}><Link href="/fleet/transactions/payment-receipt/new" className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /><span>Payment / Receipt</span></Link></SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                    </SidebarMenuSub>
                                </>
                            )}

                            <SidebarGroupLabel className="px-5 py-2 text-[10px] uppercase text-muted-foreground font-bold">Logs & History</SidebarGroupLabel>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/fleet/trip-sheets', true)}><Link href="/fleet/trip-sheets" className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>Sales Logs</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/fleet/transactions/expenses', true)}><Link href="/fleet/transactions/expenses" className="flex items-center gap-2"><Wallet className="h-4 w-4" /><span>Expense History</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/fleet/transactions/payment-receipt/list', true)}><Link href="/fleet/transactions/payment-receipt/list" className="flex items-center gap-2"><Receipt className="h-4 w-4" /><span>Pmt. / Rcd. logs</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/fleet/transactions', true)}><Link href="/fleet/transactions" className="flex items-center gap-2"><CreditCard className="h-4 w-4" /><span>Sijan Reports</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </SidebarMenu>
            </Collapsible>
        )}

        {hasPermission('rental', 'view') && (
            <Collapsible asChild defaultOpen={getIsActive('/rental')} className="group/collapsible">
                <SidebarMenu>
                    <SidebarSeparator />
                    <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip="Rental Management" isActive={getIsActive('/rental')}>
                                <Home />
                                <span>Rental Management</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/rental', true)}><Link href="/rental" className="flex items-center gap-2"><span>Dashboard</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/rental/properties')}><Link href="/rental/properties" className="flex items-center gap-2"><span>Assets & Units</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/rental/tenants')}><Link href="/rental/tenants" className="flex items-center gap-2"><span>Tenants</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/rental/agreements')}><Link href="/rental/agreements" className="flex items-center gap-2"><span>Agreements</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/rental/billing')}><Link href="/rental/billing" className="flex items-center gap-2"><span>Rent Billing</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/rental/payments')}><Link href="/rental/payments" className="flex items-center gap-2"><span>Payments</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </SidebarMenu>
            </Collapsible>
        )}
        
        <SidebarMenu>
            <SidebarSeparator />
            {hasPermission('notes', 'view') && (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={getIsActive('/notes')} tooltip="Notes & Todos"><Link href="/notes" className="flex items-center gap-2"><Notebook /><span>Notes & Todos</span></Link></SidebarMenuButton>
            </SidebarMenuItem>
            )}
        </SidebarMenu>

        <Collapsible asChild defaultOpen={getIsActive('/settings')} className="group/collapsible">
            <SidebarMenu>
                <SidebarSeparator />
                <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip="Settings" isActive={getIsActive('/settings')}>
                            <Settings />
                            <span>Settings</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <SidebarMenuSub>
                            <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/settings/general')}><Link href="/settings/general" className="flex items-center gap-2"><Settings2 className="h-4 w-4"/><span>General</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                            <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/settings/finance')}><Link href="/settings/finance" className="flex items-center gap-2"><Calculator className="h-4 w-4"/><span>Finance</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                            <SidebarMenuSubItem><SidebarMenuSubButton asChild isActive={getIsActive('/settings/system')}><Link href="/settings/system" className="flex items-center gap-2"><ShieldAlert className="h-4 w-4"/><span>System</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </SidebarMenuItem>
            </SidebarMenu>
        </Collapsible>
      </SidebarContent>
       <SidebarFooter>
        <SidebarMenu>
            <SidebarSeparator />
            <SidebarMenuItem>
               <div className="flex items-center justify-between gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
                  <div className="flex flex-col min-w-0">
                    <p className="text-xs font-black text-sidebar-foreground truncate uppercase">{user.username}</p>
                    <ConnectionStatusIndicator />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors" onClick={handleSignOut} title="Sign Out">
                      <LogOut className="h-3.5 w-3.5" />
                  </Button>
               </div>
               <SidebarMenuButton className="hidden group-data-[collapsible=icon]:flex" tooltip="Sign Out" onClick={handleSignOut}>
                  <LogOut />
               </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarCollapseButton />
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
