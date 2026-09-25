'use client';
/**
 * @fileOverview Last-resort screen for errors thrown in the root layout itself.
 *
 * `app/error.tsx` only covers pages inside the layout; an error in the layout
 * (providers, sidebar) otherwise falls through to the browser's blank
 * "Application error" page with no way back. This replaces the whole
 * document, so it has to bring its own <html> and <body>.
 */

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#f4f6f9', color: '#0b1220' }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#475569', marginBottom: 20 }}>
            The app hit an unexpected error. Your saved data is not affected.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => reset()} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
              Try again
            </button>
            <button onClick={() => { window.location.href = '/dashboard'; }} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
              Go to dashboard
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
