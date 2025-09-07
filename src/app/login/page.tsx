
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getUsers, getAdminCredentials } from '@/services/user-service';
import { Progress } from '@/components/ui/progress';

const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const loadingSteps = [
  { progress: 0, text: 'Authenticating...' },
  { progress: 20, text: 'Initializing workspace...' },
  { progress: 40, text: 'Loading user settings...' },
  { progress: 60, text: 'Fetching recent activities...' },
  { progress: 80, text: 'Preparing dashboard...' },
  { progress: 100, text: 'Finalizing setup...' },
];

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing...');
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showProgress) {
      interval = setInterval(() => {
        setProgress(prevProgress => {
          const currentStep = loadingSteps.find(step => prevProgress < step.progress);
          if (currentStep) {
            setLoadingText(currentStep.text);
            return currentStep.progress;
          }
          return 100;
        });
      }, 700);
    }
    return () => clearInterval(interval);
  }, [showProgress]);

  useEffect(() => {
    if (progress >= 100) {
      setTimeout(() => {
        router.replace('/dashboard');
      }, 500);
    }
  }, [progress, router]);

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      // Check for Administrator
      if (data.username === 'Administrator') {
        const adminCreds = getAdminCredentials();
        const defaultAdminPassword = 'Admin@123'; // Hardcoded fallback
        
        if (data.password === adminCreds.password || data.password === defaultAdminPassword) {
            await login({ id: 'admin', username: 'Administrator', permissions: {}, passwordLastUpdated: adminCreds.passwordLastUpdated });
            toast({
              title: 'Success',
              description: 'Logged in successfully as Administrator.',
            });
            setShowProgress(true);
            return;
        }
      }
      
      const allUsers = getUsers();
      const foundUser = allUsers.find(
        (user) => user.username === data.username && user.password === data.password
      );

      if (foundUser) {
        await login(foundUser);
        toast({
          title: 'Success',
          description: 'Logged in successfully.',
        });
        setShowProgress(true);
        return;
      }

      throw new Error('Invalid username or password.');

    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
         <div className="flex justify-center items-center gap-2 mb-6">
            <h1 className="text-3xl font-semibold">STARWEB</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Login</CardTitle>
            <CardDescription>Enter your credentials to access your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Username"
                  {...register('username')}
                  disabled={isLoading}
                />
                {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...register('password')} disabled={isLoading}/>
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && !showProgress && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading && !showProgress ? 'Logging in...' : 'Login'}
              </Button>
            </form>
             {showProgress && (
              <div className="space-y-2 mt-4 text-center">
                  <Progress value={progress} className="w-full" />
                  <p className="text-sm text-muted-foreground">{loadingText}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
