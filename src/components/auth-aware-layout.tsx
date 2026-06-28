'use client';
/**
 * @fileOverview Shell layout that handles auth state and fault isolation for main content.
 */

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { usePathname } from "next/navigation";
import { Separator } from "./ui/separator";
import { ErrorBoundary } from "./error-boundary";
import { getNormalizedPath } from "@/lib/utils";

export default function AuthAwareLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    
    // Normalize path to handle trailing slashes for auth state check
    const normalizedPath = getNormalizedPath(pathname);
    const isAuthPage = normalizedPath === '/login';

    if (loading) {
         return (
            <div className="flex h-screen items-center justify-center">
                <p className="text-sm text-muted-foreground font-medium">Restoring Session...</p>
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
                        {/* 
                            Isolate component-level render crashes within the main content area.
                            This prevents a bug in a specific module from crashing the entire app shell
                            (sidebar, header, navigation).
                        */}
                        <ErrorBoundary moduleName="Main Content">
                            {children}
                        </ErrorBoundary>
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </AuthRedirect>
    );
}