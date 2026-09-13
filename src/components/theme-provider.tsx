'use client';

/**
 * @fileOverview Light / dark theming.
 *
 * The Tailwind config was already set to `darkMode: ['class']` and globals.css
 * already carried a full `.dark` token block - but nothing ever put the class
 * on the document, so the dark palette had never once been used.
 *
 * next-themes handles the part that is fiddly to get right by hand: writing the
 * class before first paint so the page does not flash white on the way to dark,
 * and keeping in step with the operating system when the user has not chosen.
 */

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      // "System" is the honest default: the shop-floor machines are set up
      // however the person at them likes, and this follows that until they say
      // otherwise.
      defaultTheme="system"
      enableSystem
      // Without this, switching themes animates every transition on the page at
      // once, which looks like a fault rather than a setting.
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
