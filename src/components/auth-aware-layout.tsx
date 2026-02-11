'use client';

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { usePathname } from "next/navigation";
import { Separator } from "./ui/separator";

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
                    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden sticky top-0 bg-background z-50">
                        <SidebarTrigger />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <span className="font-semibold text-sm">STARWEB</span>
                    </header>
                    <main className="p-4 sm:px-6 sm:py-4 md:p-8">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </AuthRedirect>
    );
}
