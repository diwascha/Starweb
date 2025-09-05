
'use client';

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";

export default function AuthAwareLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) {
         return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading application...</p>
            </div>
        );
    }
    
    if (!user) {
        return <>{children}</>;
    }

    return (
        <AuthRedirect>
            {(user) => (
                <SidebarProvider>
                    <AppSidebar />
                    <SidebarInset>
                        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 md:hidden">
                            <SidebarTrigger />
                            <h1 className="text-xl font-semibold">STARWEB</h1>
                        </header>
                        <main className="p-4 sm:px-6 sm:py-0 md:p-8">
                            {children}
                        </main>
                    </SidebarInset>
                </SidebarProvider>
            )}
        </AuthRedirect>
    );
}
