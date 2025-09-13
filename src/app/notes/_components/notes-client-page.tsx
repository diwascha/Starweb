
'use client';

import { useState, useEffect } from 'react';
import type { Todo } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Plus, Trash2 } from 'lucide-react';
import { onTodosUpdate, addTodo, updateTodo, deleteTodo } from '@/services/notes-service';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function NotesClientPage({ initialTodos }: { initialTodos: Todo[] }) {
    const [todos, setTodos] = useState<Todo[]>(initialTodos);
    const [newTodo, setNewTodo] = useState('');
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const unsubscribe = onTodosUpdate(setTodos);
        return () => unsubscribe();
    }, []);

    const handleAddTodo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTodo.trim() || !user) return;

        try {
            const todoData: Omit<Todo, 'id' | 'createdAt'> = {
                content: newTodo.trim(),
                isCompleted: false,
                createdBy: user.username,
            };
            await addTodo(todoData);
            setNewTodo('');
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to add to-do item.', variant: 'destructive' });
        }
    };

    const handleToggleTodo = async (todo: Todo) => {
        try {
            await updateTodo(todo.id, { isCompleted: !todo.isCompleted, lastModifiedBy: user?.username });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update to-do item.', variant: 'destructive' });
        }
    };

    const handleDeleteTodo = async (id: string) => {
        try {
            await deleteTodo(id);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete to-do item.', variant: 'destructive' });
        }
    };

    const sortedTodos = [...todos].sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) {
            return a.isCompleted ? 1 : -1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Notes & Todos</h1>
                <p className="text-muted-foreground">Keep track of your tasks and reminders.</p>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>To-Do List</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddTodo} className="flex gap-2 mb-4">
                                <Input
                                    placeholder="Add a new task..."
                                    value={newTodo}
                                    onChange={(e) => setNewTodo(e.target.value)}
                                />
                                <Button type="submit">
                                    <Plus className="mr-2 h-4 w-4" /> Add
                                </Button>
                            </form>
                            <ScrollArea className="h-[calc(100vh-20rem)] pr-4">
                                <div className="space-y-3">
                                    {sortedTodos.length > 0 ? (
                                        sortedTodos.map(todo => (
                                            <div key={todo.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                                                <Checkbox
                                                    id={`todo-${todo.id}`}
                                                    checked={todo.isCompleted}
                                                    onCheckedChange={() => handleToggleTodo(todo)}
                                                />
                                                <div className="flex-1">
                                                    <label
                                                        htmlFor={`todo-${todo.id}`}
                                                        className={cn(
                                                            "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                                                            todo.isCompleted && "line-through text-muted-foreground"
                                                        )}
                                                    >
                                                        {todo.content}
                                                    </label>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Added by {todo.createdBy} {formatDistanceToNow(new Date(todo.createdAt), { addSuffix: true })}
                                                    </p>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteTodo(todo.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center text-muted-foreground py-8">
                                            <p>No tasks yet. Add one above to get started!</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-1">
                     <Card className="overflow-hidden">
                        <CardHeader className="p-4">
                            <CardTitle>Nepali Calendar</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <iframe 
                                src="https://www.hamropatro.com/widgets/calender-small.php" 
                                frameBorder="0" 
                                scrolling="no" 
                                marginWidth="0" 
                                marginHeight="0" 
                                style={{ border: 'none', overflow: 'hidden', width: '100%', height: '290px' }} 
                                allowtransparency="true">
                            </iframe>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
