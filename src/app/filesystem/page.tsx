
'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    FileText, 
    Upload, 
    Trash2, 
    Download, 
    Search, 
    Filter, 
    HardDrive, 
    Loader2, 
    File, 
    FileImage, 
    FileSpreadsheet, 
    Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onFilesUpdate, addFileRecord, removeFileRecord, type FileRecord } from '@/services/file-service';
import { uploadFile, deleteFile } from '@/services/storage-service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

export default function FileSystemPage() {
    const [files, setFiles] = useState<FileRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [isUploading, setIsSubmitting] = useState(false);
    
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        setIsLoading(true);
        const unsub = onFilesUpdate((data) => {
            setFiles(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    const filteredFiles = useMemo(() => {
        return files.filter(f => {
            const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = categoryFilter === 'All' || f.category === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }, [files, searchQuery, categoryFilter]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsSubmitting(true);
        try {
            const path = `uploads/${Date.now()}_${file.name}`;
            const url = await uploadFile(file, path);
            
            await addFileRecord({
                name: file.name,
                url,
                size: file.size,
                type: file.type,
                path,
                uploadedBy: user.username,
                uploadedAt: new Date().toISOString(),
                category: (categoryFilter === 'All' ? 'General' : categoryFilter) as any
            });

            toast({ title: 'File Uploaded', description: file.name });
        } catch (err: any) {
            toast({ title: 'Upload Failed', description: err.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (file: FileRecord) => {
        try {
            await deleteFile(file.url);
            await removeFileRecord(file.id);
            toast({ title: 'File Deleted' });
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    };

    const getFileIcon = (type: string) => {
        if (type.includes('image')) return <FileImage className="h-4 w-4 text-blue-500" />;
        if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
        if (type.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
        return <File className="h-4 w-4 text-gray-500" />;
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">File Manager</h1>
                    <p className="text-muted-foreground">Secure document storage and organization for the enterprise.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <label className="flex-1 md:flex-none">
                        <Input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                        <Button asChild disabled={isUploading} className="w-full">
                            <span>
                                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
                                Upload Document
                            </span>
                        </Button>
                    </label>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="md:col-span-1 shadow-sm h-fit">
                    <CardHeader><CardTitle className="text-sm font-bold uppercase">Filter Library</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Search by Name</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search files..." 
                                    className="pl-8" 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Category</Label>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Documents</SelectItem>
                                    <SelectItem value="HR">HR Documents</SelectItem>
                                    <SelectItem value="Fleet">Fleet Records</SelectItem>
                                    <SelectItem value="Finance">Financial Slips</SelectItem>
                                    <SelectItem value="CRM">Client Files</SelectItem>
                                    <SelectItem value="General">Miscellaneous</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-3 shadow-sm">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-6">File Name</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Uploaded By</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                                ) : filteredFiles.map(file => (
                                    <TableRow key={file.id} className="group hover:bg-muted/30">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                {getFileIcon(file.type)}
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{file.name}</span>
                                                    <span className="text-[10px] text-muted-foreground">{format(new Date(file.uploadedAt), 'PPp')}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-tight">{file.category}</Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatSize(file.size)}</TableCell>
                                        <TableCell className="text-xs font-medium">{file.uploadedBy}</TableCell>
                                        <TableCell className="text-right pr-6 space-x-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                                <a href={file.url} target="_blank" rel="noopener noreferrer">
                                                    <Download className="h-4 w-4" />
                                                </a>
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(file)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!isLoading && filteredFiles.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground italic">
                                            <HardDrive className="h-8 w-8 mx-auto opacity-10 mb-2"/>
                                            Your cloud storage is empty or matches no filters.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
