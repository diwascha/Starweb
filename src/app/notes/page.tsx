
import { getNoteItems } from '@/services/notes-service';
import NotesClientPage from './_components/notes-client-page';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

function NotesSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
            <div className="lg:col-span-1">
                <Skeleton className="h-80 w-full" />
            </div>
        </div>
    )
}

export default async function NotesPage() {
    const initialItems = await getNoteItems();

    return (
        <Suspense fallback={<NotesSkeleton />}>
            <NotesClientPage initialItems={initialItems} />
        </Suspense>
    );
}
