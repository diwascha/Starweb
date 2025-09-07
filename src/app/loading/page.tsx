
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/use-auth';

const loadingSteps = [
  { progress: 0, text: 'Authenticating...' },
  { progress: 20, text: 'Initializing workspace...' },
  { progress: 40, text: 'Loading user settings...' },
  { progress: 60, text: 'Fetching recent activities...' },
  { progress: 80, text: 'Preparing dashboard...' },
  { progress: 100, text: 'Finalizing setup...' },
];

export default function LoadingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing...');

  useEffect(() => {
    // Redirect if user is not logged in and not loading
    if (!loading && !user) {
      router.replace('/login');
      return;
    }

    // Start the loading animation if user is logged in
    if (user) {
        const interval = setInterval(() => {
        setProgress(prevProgress => {
          const currentStep = loadingSteps.find(step => prevProgress < step.progress);
          if (currentStep) {
            setLoadingText(currentStep.text);
            return currentStep.progress;
          }
          return 100;
        });
      }, 700); // Adjust timing as needed

      return () => clearInterval(interval);
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (progress >= 100) {
      setTimeout(() => {
        router.replace('/dashboard');
      }, 500); // Short delay before redirecting
    }
  }, [progress, router]);


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-semibold">STARWEB</h1>
        <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground">{loadingText}</p>
        </div>
      </div>
    </div>
  );
}
