
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
} from '@/components/ui/sidebar';
import { FileText, LayoutDashboard, TestTubeDiagonal, Package, FileSpreadsheet, ShoppingCart, Wrench, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';

export function AppSidebar() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  const { user, logout } = useAuth();
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

  const getIsActive = (path: string, checkStartsWith: boolean = false) => {
    if (!isClient) {
      return false;
    }
    if (checkStartsWith) {
      if (path === '/reports' && (pathname.startsWith('/report/') || pathname.startsWith('/reports'))) {
        return true;
      }
       if (path === '/purchase-orders' && (pathname.startsWith('/purchase-orders') || pathname.startsWith('/purchase-orders'))) {
        return true;
      }
      return pathname.startsWith(path);
    }
    if (path === '/reports' && pathname === '/') {
        return true;
    }
    return pathname === path;
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
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={getIsActive('/dashboard')}>
            <Link href="/dashboard">
              <LayoutDashboard />
              <span>Dashboard</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={getIsActive('/report/new')}>
            <Link href="/report/new">
              <FileText />
              <span>New QT Reports</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
         <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={getIsActive('/reports', true)}>
            <Link href="/reports">
              <FileSpreadsheet />
              <span>QT Reports Database</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={getIsActive('/products', true)}>
            <Link href="/products">
              <Package />
              <span>QT Product</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
         <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={getIsActive('/purchase-orders', true)}>
            <Link href="/purchase-orders">
              <ShoppingCart />
              <span>Purchase Orders</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
         <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={getIsActive('/raw-materials', true)}>
            <Link href="/raw-materials">
              <Wrench />
              <span>Raw Materials</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {user.role === 'Admin' && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={getIsActive('/settings', true)}>
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
