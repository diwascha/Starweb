
'use client';

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
  const isReportsActive = pathname === '/reports' || pathname.startsWith('/report/') || pathname === '/';

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
          <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
            <Link href="/dashboard">
              <LayoutDashboard />
              <span>Dashboard</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname === '/report/new'}>
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
          <SidebarMenuButton asChild isActive={pathname.startsWith('/purchase-orders')}>
            <Link href="/purchase-orders">
              <ShoppingCart />
              <span>Purchase Orders</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.startsWith('/products')}>
            <Link href="/products">
              <Package />
              <span>Products</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
         <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.startsWith('/raw-materials')}>
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
