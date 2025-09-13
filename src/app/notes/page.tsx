
import { getTodos } from '@/services/notes-service';
import NotesClientPage from './_components/notes-client-page';

export default async function NotesPage() {
    const initialTodos = await getTodos();

    return <NotesClientPage initialTodos={initialTodos} />;
}
