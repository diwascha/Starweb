
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
} from '@/components/ui/sidebar';
import { FileText, LayoutDashboard, Package, FileSpreadsheet, ShoppingCart, Wrench, LogOut, Settings, Users, Calendar, Award, Wallet, Building2, PlusCircle, Truck, ShieldCheck, CreditCard, ArrowRightLeft, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';

export function AppSidebar() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const handleSignOut = async () => {
    try {
        await logout();
        toast({ title: 'Signed Out', description: 'You have been successfully signed out.'});
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to sign out.', variant: 'destructive'});
    }
  };

  const getIsActive = (path: string) => {
    if (!isClient) return false;
    if (path === '/dashboard') return pathname === path;
    if (path.endsWith('/new')) return pathname === path;
    return pathname.startsWith(path) && (pathname[path.length] === '/' || pathname.length === path.length);
  };
  
  if (!user) {
    return null;
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">STARWEB</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
            {hasPermission('dashboard', 'view') && (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={getIsActive('/dashboard')}>
                <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            )}

            {(hasPermission('reports', 'view') || hasPermission('products', 'view')) && (
                 <>
                    <SidebarSeparator />
                     <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={getIsActive('/reports')}>
                        <Link href="/reports">
                            <FileText />
                            <span>Test Report Mgmt</span>
                        </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <div className="ml-4">
                        {hasPermission('reports', 'create') && (
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/report/new')}>
                                <Link href="/report/new">
                                    <PlusCircle />
                                    <span>New QT Reports</span>
                                </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                        {hasPermission('reports', 'view') && (
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/reports/list')}>
                                <Link href="/reports/list">
                                    <FileSpreadsheet />
                                    <span>QT Reports Database</span>
                                </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                        {hasPermission('products', 'view') && (
                             <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/products')}>
                                <Link href="/products">
                                    <Package />
                                    <span>QT Products</span>
                                </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                    </div>
                </>
            )}
            
            {(hasPermission('purchaseOrders', 'view') || hasPermission('rawMaterials', 'view')) && (
                <>
                    <SidebarSeparator />
                     <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={getIsActive('/purchase-orders')}>
                        <Link href="/purchase-orders">
                            <ShoppingCart />
                            <span>Purchase Order Mgmt</span>
                        </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <div className="ml-4">
                        {hasPermission('purchaseOrders', 'view') && (
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/purchase-orders/list')}>
                                <Link href="/purchase-orders/list">
                                    <FileSpreadsheet />
                                    <span>Purchase Orders</span>
                                </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                        {hasPermission('rawMaterials', 'view') && (
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={getIsActive('/raw-materials')}>
                                <Link href="/raw-materials">
                                    <Wrench />
                                    <span>Raw Materials</span>
                                </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                    </div>
                </>
            )}
        </SidebarMenu>
        <SidebarMenu>
             <SidebarSeparator />
             <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={getIsActive('/hr')}>
                <Link href="/hr">
                    <Building2 />
                    <span>HR Management</span>
                </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            <div className="ml-4">
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={getIsActive('/hr/employees')}>
                    <Link href="/hr/employees">
                        <Users />
                        <span>Employees</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={getIsActive('/hr/attendance')}>
                    <Link href="/hr/attendance">
                        <Calendar />
                        <span>Attendance</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={getIsActive('/hr/payroll')} disabled>
                    <Link href="#">
                        <FileText />
                        <span>Payroll</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={getIsActive('/hr/bonus')} disabled>
                    <Link href="#">
                        <Award />
                        <span>Bonus</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={getIsActive('/hr/payslip')} disabled>
                    <Link href="#">
                        <Wallet />
                        <span>Payslip</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </div>
        </SidebarMenu>
        <SidebarMenu>
            {hasPermission('fleet', 'view') && (
                 <>
                    <SidebarSeparator />
                     <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={getIsActive('/fleet')}>
                        <Link href="/fleet">
                            <Truck />
                            <span>Fleet Management</span>
                        </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <div className="ml-4">
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={getIsActive('/fleet/vehicles')}>
                            <Link href="/fleet/vehicles">
                                <Truck />
                                <span>Vehicles</span>
                            </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={getIsActive('/fleet/drivers')}>
                            <Link href="/fleet/drivers">
                                <Users />
                                <span>Drivers</span>
                            </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={getIsActive('/fleet/policies')}>
                            <Link href="/fleet/policies">
                                <ShieldCheck />
                                <span>Policies & Memberships</span>
                            </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={getIsActive('/fleet/transactions')}>
                            <Link href="/fleet/transactions">
                                <CreditCard />
                                <span>Transactions</span>
                            </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={getIsActive('/fleet/trip-sheets')}>
                            <Link href="/fleet/trip-sheets">
                                <FileText />
                                <span>Sales - Trip Sheet</span>
                            </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <div className="ml-4">
                            {hasPermission('fleet', 'create') && (
                                <>
                                 <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/fleet/trip-sheets/new')}>
                                    <Link href="/fleet/trip-sheets/new">
                                        <TrendingUp />
                                        <span>New Sales</span>
                                    </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/fleet/transactions/purchase/new')}>
                                    <Link href="/fleet/transactions/purchase/new">
                                        <ShoppingCart />
                                        <span>New Purchase</span>
                                    </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild isActive={getIsActive('/fleet/transactions/payment-receipt/new')}>
                                    <Link href="/fleet/transactions/payment-receipt/new">
                                        <ArrowRightLeft />
                                        <span>New Payment/Receipt</span>
                                    </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                </>
                            )}
                         </div>
                    </div>
                </>
            )}
        </SidebarMenu>
      </SidebarContent>
       <SidebarFooter>
        <SidebarMenu>
            <SidebarSeparator />
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
      </SidebarFooter>
    </Sidebar>
  );
}

    
