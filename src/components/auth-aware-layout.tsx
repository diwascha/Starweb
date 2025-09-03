
'use client';

import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarInset } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { usePathname } from "next/navigation";

export default function AuthAwareLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();

    const isAuthPage = pathname === '/login';

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading application...</p>
            </div>
        );
    }
    
    if (isAuthPage || !user) {
        return <>{children}</>;
    }

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
    );
}
