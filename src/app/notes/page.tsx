
import { getNoteItems } from '@/services/notes-service';
import NotesClientPage from './_components/notes-client-page';

export default async function NotesPage() {
    const initialItems = await getNoteItems();

    return <NotesClientPage initialItems={initialItems} />;
}
