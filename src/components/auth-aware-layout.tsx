
'use client';

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { usePathname } from "next/navigation";
import { SidebarInset } from './ui/sidebar';

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
    
    if (isAuthPage) {
        return <AuthRedirect>{children}</AuthRedirect>;
    }
    
    return (
        <AuthRedirect>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                    <main className="p-4 sm:px-6 sm:py-0 md:p-8">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </AuthRedirect>
    );
}
