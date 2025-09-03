
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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { FileText, LayoutDashboard, TestTubeDiagonal, Package, FileSpreadsheet, ShoppingCart, Wrench, LogOut, Settings, Users, Calendar } from 'lucide-react';
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
    return pathname.startsWith(path);
  };
  
  if (!user) {
    return null;
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <TestTubeDiagonal className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-semibold">Shivam QTR</h1>
        </div>
      </SidebarHeader>
      <SidebarMenu>
        {hasPermission('dashboard', 'view') && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
              <Link href="/dashboard">
                <LayoutDashboard />
                <span>Dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        {hasPermission('reports', 'create') && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/report/new'}>
              <Link href="/report/new">
                <FileText />
                <span>New QT Reports</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
         {hasPermission('reports', 'view') && (
           <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={getIsActive('/reports') || getIsActive('/report')}>
              <Link href="/reports">
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
        {hasPermission('purchaseOrders', 'view') && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={getIsActive('/purchase-orders')}>
              <Link href="/purchase-orders">
                <ShoppingCart />
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
        
        {hasPermission('hr', 'view') && <SidebarSeparator />}

        {hasPermission('hr', 'view') && (
            <SidebarGroup className="p-2 pb-0">
                <SidebarGroupLabel className="px-2">HR Management</SidebarGroupLabel>
                <SidebarGroupContent>
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
                </SidebarGroupContent>
            </SidebarGroup>
        )}
        
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
       <SidebarFooter className="mt-auto">
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
