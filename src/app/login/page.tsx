
'use client';

import { useState } from 'react';
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
import useLocalStorage from '@/hooks/use-local-storage';
import type { User } from '@/lib/types';
import { getAdminCredentials } from '@/lib/utils';
import Image from 'next/image';

const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [users] = useLocalStorage<User[]>('users', []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      // Check for Administrator
      if (data.username === 'Administrator') {
        const adminCreds = getAdminCredentials();
        const defaultAdminPassword = 'Admin@123'; // Hardcoded fallback
        
        // Allow login with either the stored password or the default fallback password.
        if (data.password === adminCreds.password || data.password === defaultAdminPassword) {
            await login({ id: 'admin', username: 'Administrator', permissions: {}, passwordLastUpdated: adminCreds.passwordLastUpdated });
            toast({
              title: 'Success',
              description: 'Logged in successfully as Administrator.',
            });
            router.push('/dashboard');
            return;
        }
      }
      
      // Then, check against users in local storage for non-admin users
      const foundUser = users.find(
        (user) => user.username === data.username && user.password === data.password
      );

      if (foundUser) {
        await login(foundUser);
        toast({
          title: 'Success',
          description: 'Logged in successfully.',
        });
        router.push('/dashboard');
        return;
      }

      throw new Error('Invalid username or password.');

    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
         <div className="flex justify-center items-center gap-2 mb-6">
            <Image src="/logo.png" alt="Company Logo" width={60} height={60} />
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
                  placeholder="Administrator"
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
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
