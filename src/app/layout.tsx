
import type {Metadata} from 'next';
import './globals.css';
import {Toaster} from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/use-auth';
import AuthAwareLayout from '@/components/auth-aware-layout';
import { Inter } from 'next/font/google';


export const metadata: Metadata = {
  title: 'STARWEB',
  description: 'Generate test reports for multiple products.',
};

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-body antialiased bg-background" suppressHydrationWarning>
          <AuthProvider>
              <AuthAwareLayout>
                  {children}
              </AuthAwareLayout>
          </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
