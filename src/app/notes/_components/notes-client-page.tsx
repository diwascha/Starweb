
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { NoteItem, NoteItemType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Plus, Trash2, CalendarIcon, Bell, StickyNote, ListTodo, Search, Edit, Sparkles, AlertTriangle } from 'lucide-react';
import { onNoteItemsUpdate, addNoteItem, updateNoteItem, deleteNoteItem, cleanupOldItems } from '@/services/notes-service';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, toNepaliDate } from '@/lib/utils';
import { format, isPast, isToday, isFuture, startOfDay, formatDistanceToNow } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';


const renderContentWithBullets = (content: string) => {
    if (!content) return null;
    return content.split('\n').map((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
            return (
                <div key={index} className="flex items-start pl-4">
                    <span className="mr-2 mt-1">•</span>
                    <span className="flex-1">{trimmedLine.substring(2)}</span>
                </div>
            );
        }
        return <p key={index}>{line}</p>;
    });
};

export default function NotesClientPage({ initialItems }: { initialItems: NoteItem[] }) {
    const [items, setItems] = useState<NoteItem[]>(initialItems);
    const [newItemType, setNewItemType] = useState<NoteItemType>('Todo');
    const [newItemTitle, setNewItemTitle] = useState('');
    const [newItemContent, setNewItemContent] = useState('');
    const [newItemDueDate, setNewItemDueDate] = useState<Date | null>(null);
    const [newItemDueTime, setNewItemDueTime] = useState('');

    const [searchQuery, setSearchQuery] = useState('');
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<NoteItem | null>(null);
    const [editingTime, setEditingTime] = useState('');
    const [isCleaning, setIsCleaning] = useState(false);

    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const unsubscribe = onNoteItemsUpdate(setItems);
        return () => unsubscribe();
    }, []);

    const resetForm = () => {
        setNewItemTitle('');
        setNewItemContent('');
        setNewItemDueDate(null);
        setNewItemDueTime('');
        setNewItemType('Todo');
    };
    
    const combineDateTime = (date: Date | null, time: string): Date | null => {
        if (!date) return null;
        const newDate = new Date(date);
        if (time) {
            const [hours, minutes] = time.split(':').map(Number);
            if (!isNaN(hours) && !isNaN(minutes)) {
                newDate.setHours(hours, minutes, 0, 0);
            }
        }
        return newDate;
    };


    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItemTitle.trim() || !user) return;

        const combinedDueDate = combineDateTime(newItemDueDate, newItemDueTime);

        try {
            const itemData: Omit<NoteItem, 'id' | 'createdAt'> = {
                type: newItemType,
                title: newItemTitle.trim(),
                content: newItemContent.trim() || undefined,
                isCompleted: false,
                dueDate: combinedDueDate ? combinedDueDate.toISOString() : null,
                createdBy: user.username,
            };
            await addNoteItem(itemData);
            resetForm();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
        }
    };

    const handleToggleTodo = async (item: NoteItem) => {
        if (!user) return;
        try {
            await updateNoteItem(item.id, {
                isCompleted: !item.isCompleted,
                lastModifiedBy: user.username,
                completedAt: !item.isCompleted ? new Date().toISOString() : null,
            });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update item.', variant: 'destructive' });
        }
    };

    const handleDeleteItem = async (id: string) => {
        try {
            await deleteNoteItem(id);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete item.', variant: 'destructive' });
        }
    };
    
    const handleOpenEditDialog = (item: NoteItem) => {
        setEditingItem({
            ...item,
            dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : null
        });
        setEditingTime(item.dueDate ? format(new Date(item.dueDate), 'HH:mm') : '');
        setIsEditDialogOpen(true);
    };

    const handleUpdateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingItem || !user) return;
        
        const combinedDueDate = combineDateTime(
            editingItem.dueDate ? new Date(editingItem.dueDate) : null,
            editingTime
        );

        try {
            const updatedData: Partial<Omit<NoteItem, 'id'>> = {
                ...editingItem,
                dueDate: combinedDueDate ? combinedDueDate.toISOString() : null,
                lastModifiedBy: user.username,
            };
            await updateNoteItem(editingItem.id, updatedData);
            toast({ title: 'Success', description: 'Item updated.' });
            setIsEditDialogOpen(false);
            setEditingItem(null);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update item.', variant: 'destructive' });
        }
    };
    
    const handleCleanup = async () => {
        setIsCleaning(true);
        try {
            const count = await cleanupOldItems();
            toast({
                title: 'Cleanup Complete',
                description: `${count} old item(s) have been permanently deleted.`
            });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to clean up old items.', variant: 'destructive' });
        } finally {
            setIsCleaning(false);
        }
    };


    const categorizedItems = useMemo(() => {
        let filteredItems = [...items];
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filteredItems = filteredItems.filter(item => 
                item.title.toLowerCase().includes(lowercasedQuery) ||
                (item.content || '').toLowerCase().includes(lowercasedQuery)
            );
        }
        
        const today = startOfDay(new Date());
        const categories: { today: NoteItem[]; upcoming: NoteItem[]; past: NoteItem[] } = {
            today: [],
            upcoming: [],
            past: []
        };
        
        filteredItems.sort((a, b) => (a.isCompleted ? 1 : -1) - (b.isCompleted ? 1 : -1) || (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        for (const item of filteredItems) {
            if (item.dueDate) {
                const dueDate = startOfDay(new Date(item.dueDate));
                if (isToday(dueDate)) {
                    categories.today.push(item);
                } else if (isFuture(dueDate)) {
                    categories.upcoming.push(item);
                } else {
                    categories.past.push(item);
                }
            } else {
                categories.upcoming.push(item);
            }
        }
        
        return categories;

    }, [items, searchQuery]);
    
    const getIconForType = (type: NoteItemType) => {
        switch (type) {
            case 'Todo': return <ListTodo className="h-4 w-4" />;
            case 'Note': return <StickyNote className="h-4 w-4" />;
            case 'Reminder': return <Bell className="h-4 w-4" />;
        }
    };
    
    const formatDueDate = (dueDate: string) => {
        const date = new Date(dueDate);
        const datePart = toNepaliDate(dueDate) + ' BS (' + format(date, 'PPP') + ')';
        // Check if time is set (not midnight)
        if (date.getHours() !== 0 || date.getMinutes() !== 0) {
            return `${datePart} at ${format(date, 'p')}`;
        }
        return datePart;
    };
    
    const renderItemList = (itemList: NoteItem[], categoryName: string) => (
        <div>
            <h3 className="text-lg font-semibold my-2 px-3">{categoryName}</h3>
            {itemList.length > 0 ? (
                itemList.map(item => (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-md hover:bg-muted/50">
                        {item.type === 'Todo' ? (
                            <Checkbox
                                id={`item-${item.id}`}
                                checked={item.isCompleted}
                                onCheckedChange={() => handleToggleTodo(item)}
                                className="mt-1"
                            />
                        ) : (
                            <div className="mt-1 text-muted-foreground">{getIconForType(item.type)}</div>
                        )}
                        <div className="flex-1">
                            <label
                                htmlFor={`item-${item.id}`}
                                className={cn(
                                    "font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                                    item.isCompleted && "line-through text-muted-foreground"
                                )}
                            >
                                {item.title}
                            </label>
                            {item.content && (
                                <div className={cn("text-sm text-muted-foreground mt-1 space-y-1", item.isCompleted && "line-through")}>
                                  {renderContentWithBullets(item.content)}
                                </div>
                            )}
                            {(item.type === 'Reminder' || item.type === 'Todo') && item.dueDate && (
                                <p className={cn("text-xs font-semibold mt-1", isPast(new Date(item.dueDate)) && !item.isCompleted ? "text-destructive" : "text-muted-foreground")}>
                                  Due: {formatDueDate(item.dueDate)}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                                Added by {item.createdBy} {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </p>
                        </div>
                        <div className="flex">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditDialog(item)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteItem(item.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center text-muted-foreground py-4 text-sm">
                    <p>No items in this category.</p>
                </div>
            )}
        </div>
    );


    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle>My List</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAddItem} className="flex flex-col gap-4 mb-4 p-4 border rounded-lg">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Select value={newItemType} onValueChange={(v: NoteItemType) => setNewItemType(v)}>
                                    <SelectTrigger className="w-full sm:w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Todo">Todo</SelectItem>
                                        <SelectItem value="Note">Note</SelectItem>
                                        <SelectItem value="Reminder">Reminder</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    placeholder="Title..."
                                    value={newItemTitle}
                                    onChange={(e) => setNewItemTitle(e.target.value)}
                                    required
                                />
                                {(newItemType === 'Reminder' || newItemType === 'Todo') && (
                                   <div className="flex gap-2 w-full sm:w-auto">
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newItemDueDate && "text-muted-foreground")}>
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {newItemDueDate ? format(newItemDueDate, "PPP") : <span>Set due date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <DualCalendar selected={newItemDueDate || undefined} onSelect={(d) => setNewItemDueDate(d || null)} />
                                            </PopoverContent>
                                        </Popover>
                                        {newItemType === 'Reminder' && (
                                            <Input 
                                                type="time"
                                                className="w-[120px]"
                                                value={newItemDueTime}
                                                onChange={(e) => setNewItemDueTime(e.target.value)}
                                            />
                                        )}
                                   </div>
                                )}
                            </div>
                            <Textarea 
                                placeholder="Add a description or content... Use * or - for bullets."
                                value={newItemContent}
                                onChange={(e) => setNewItemContent(e.target.value)}
                            />
                            <Button type="submit" className="w-full sm:w-auto self-end">
                                <Plus className="mr-2 h-4 w-4" /> Add Item
                            </Button>
                        </form>

                        <div className="flex flex-col sm:flex-row gap-2 mb-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search list..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" disabled={isCleaning}>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        {isCleaning ? 'Cleaning...' : 'Clear Old Items'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete completed todos and old notes/reminders older than 14 days. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleCleanup}>Confirm</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>

                        <ScrollArea className="h-[calc(100vh-32rem)] pr-4">
                            <div className="space-y-3">
                                {items.length > 0 ? (
                                    <>
                                        {renderItemList(categorizedItems.today, 'Today')}
                                        {renderItemList(categorizedItems.upcoming, 'Upcoming')}
                                        {renderItemList(categorizedItems.past, 'Past')}
                                    </>
                                ) : (
                                    <div className="text-center text-muted-foreground py-8">
                                        <p>No items yet. Add one above to get started!</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-1">
                 <div className="space-y-2">
                    <h2 className="text-lg font-semibold">Nepali Calendar</h2>
                    <iframe 
                        src="https://www.hamropatro.com/widgets/calender-small.php" 
                        frameBorder="0" 
                        scrolling="no" 
                        marginWidth="0" 
                        marginHeight="0" 
                        style={{ border: 'none', overflow: 'hidden', width: '100%', height: '290px' }}
                        >
                    </iframe>
                </div>
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Item</DialogTitle>
                        <DialogDescription>
                            Make changes to your item below. Click save when you're done.
                        </DialogDescription>
                    </DialogHeader>
                    {editingItem && (
                        <form id="edit-item-form" onSubmit={handleUpdateItem}>
                             <div className="flex flex-col gap-4 py-4">
                                <Select 
                                    value={editingItem.type} 
                                    onValueChange={(v: NoteItemType) => setEditingItem(prev => prev ? {...prev, type: v} : null)}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Todo">Todo</SelectItem>
                                        <SelectItem value="Note">Note</SelectItem>
                                        <SelectItem value="Reminder">Reminder</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={editingItem.title}
                                    onChange={(e) => setEditingItem(prev => prev ? {...prev, title: e.target.value} : null)}
                                />
                                <Textarea
                                    placeholder="Add a description or content..."
                                    value={editingItem.content || ''}
                                    onChange={(e) => setEditingItem(prev => prev ? {...prev, content: e.target.value} : null)}
                                />
                                {(editingItem.type === 'Reminder' || editingItem.type === 'Todo') && (
                                    <div className="flex gap-2">
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editingItem.dueDate && "text-muted-foreground")}>
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {editingItem.dueDate ? format(new Date(editingItem.dueDate), "PPP") : <span>Set due date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <DualCalendar 
                                                    selected={editingItem.dueDate ? new Date(editingItem.dueDate) : undefined} 
                                                    onSelect={(d) => setEditingItem(prev => prev ? {...prev, dueDate: d ? d.toISOString() : null} : null)} />
                                            </PopoverContent>
                                        </Popover>
                                        {editingItem.type === 'Reminder' && (
                                            <Input
                                                type="time"
                                                className="w-[120px]"
                                                value={editingTime}
                                                onChange={(e) => setEditingTime(e.target.value)}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        </form>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" form="edit-item-form">Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
