
'use client';

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { usePathname } from "next/navigation";
import { SidebarInset } from './ui/sidebar';

export default function AuthAwareLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();

    if (loading) {
         return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading application...</p>
            </div>
        );
    }
    
    const isAuthPage = pathname === '/login';

    if (!user && !isAuthPage) {
       return <AuthRedirect>{() => children}</AuthRedirect>
    }
    
    if (isAuthPage) {
        return <>{children}</>;
    }

    return (
        <AuthRedirect>
            {(user) => (
                <SidebarProvider>
                    <AppSidebar />
                    <SidebarInset>
                        <main className="p-4 sm:px-6 sm:py-0 md:p-8">
                            {children}
                        </main>
                    </SidebarInset>
                </SidebarProvider>
            )}
        </AuthRedirect>
    );
}
