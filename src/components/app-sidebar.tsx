
'use client';

import { useState, useEffect } from 'react';
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { FileText, LayoutDashboard, TestTubeDiagonal, Package, FileSpreadsheet, ShoppingCart, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppSidebar() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const getIsActive = (path: string, checkStartsWith: boolean = false, checkRoot: boolean = false) => {
    if (!isClient) return false;
    if (checkStartsWith) {
      return pathname.startsWith(path);
    }
    if (checkRoot) {
      return pathname === path || (path === '/reports' && pathname === '/');
    }
    return pathname === path;
  };
  
  const isReportsActive = getIsActive('/reports', true, true);
  
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
              <span>New QT Report</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
         <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isReportsActive}>
            <Link href="/reports">
              <FileSpreadsheet />
              <span>QT Reports Database</span>
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
          <SidebarMenuButton asChild isActive={getIsActive('/products', true)}>
            <Link href="/products">
              <Package />
              <span>Products</span>
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
      </SidebarMenu>
    </Sidebar>
  );
}
