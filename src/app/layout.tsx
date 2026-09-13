
import type {Metadata} from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import AuthAwareLayout from '@/components/auth-aware-layout';
import { Inter } from 'next/font/google';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { UsageTracker } from '@/components/usage-tracker';
import { SessionManager } from '@/components/session-manager';
import { ThemeProvider, themeInitScript } from '@/components/theme-provider';
import icon from '@/app/signup/StarSutra.png';

export const metadata: Metadata = {
  title: 'StarSutra',
  description: 'Generate test reports for multiple products.',
  icons: {
    icon: icon.src,
  },
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
      <head>
        {/* Sets the theme class before the first paint. Without it a dark-mode
            user sees a white page for a frame on every single navigation. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-body antialiased bg-background" suppressHydrationWarning>
        <ThemeProvider>
          <FirebaseClientProvider>
            <AuthProvider>
                <UsageTracker />
                <SessionManager />
                <AuthAwareLayout>
                    {children}
                </AuthAwareLayout>
            </AuthProvider>
          </FirebaseClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
