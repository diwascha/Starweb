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
    Plus,
    ShieldCheck,
    History,
    Info,
    Settings,
    AlertTriangle
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
import { Separator } from '@/components/ui/separator';

/**
 * Security Constants for File Upload
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv'
];

export default function FileSystemPage() {
    const [files, setFiles] = useState<FileRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [isUploading, setIsSubmitting] = useState(false);
    
    const { user, hasPermission } = useAuth();
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
        
        if (!hasPermission('filesystem', 'add')) {
            toast({ title: 'Access Denied', description: 'You do not have permission to upload files.', variant: 'destructive' });
            return;
        }

        // 1. File Size Validation
        if (file.size > MAX_FILE_SIZE) {
            toast({ 
                title: 'File Rejected', 
                description: 'Maximum allowed file size is 2MB.', 
                variant: 'destructive' 
            });
            return;
        }

        // 2. File Type / MIME Validation
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            toast({ 
                title: 'Invalid Type', 
                description: 'Only images, PDFs, and common business documents are allowed.', 
                variant: 'destructive' 
            });
            return;
        }

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
            toast({ 
                title: 'Upload Blocked', 
                description: err.message, 
                variant: 'destructive',
                duration: 6000 
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (file: FileRecord) => {
        if (!hasPermission('filesystem', 'delete')) {
            toast({ title: 'Access Denied', description: 'You do not have permission to delete files.', variant: 'destructive' });
            return;
        }
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

    if (!hasPermission('filesystem', 'view')) {
        return <div className="p-8 text-center text-muted-foreground italic">You do not have permission to access the File Manager.</div>;
    }

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 uppercase">File Manager</h1>
                    <p className="text-muted-foreground">Secure document storage and organization for the enterprise.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    {hasPermission('filesystem', 'add') && (
                        <label className="flex-1 md:flex-none">
                            <Input 
                                type="file" 
                                className="hidden" 
                                onChange={handleFileUpload} 
                                disabled={isUploading}
                                accept=".jpg,.jpeg,.png,.pdf,.xlsx,.xls,.docx,.doc,.csv" 
                            />
                            <Button asChild disabled={isUploading} className="w-full h-10 font-bold uppercase text-xs tracking-widest shadow-lg shadow-primary/20">
                                <span>
                                    {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
                                    Upload Document
                                </span>
                            </Button>
                        </label>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-primary/[0.03] border-primary/10 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase text-primary flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Cloud Document Vault
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Store official PDFs, images, and spreadsheets safely in your organization's private Firebase storage bucket.
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/[0.03] border-primary/10 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase text-primary flex items-center gap-2">
                            <Filter className="h-3.5 w-3.5" />
                            Module Categorization
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Organize files by department (HR, Fleet, Finance) to maintain a logical digital filing system.
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/[0.03] border-primary/10 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase text-primary flex items-center gap-2">
                            <History className="h-3.5 w-3.5" />
                            Audit Ready
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Every upload is timestamped and attributed to a user, creating a verifiable record of all business documentation.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1 space-y-6">
                    <Card className="shadow-sm border-gray-200">
                        <CardHeader className="bg-muted/30 border-b py-3 px-4">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Filter Library</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Search by Name</Label>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="Search files..." 
                                        className="pl-8 h-9 text-xs" 
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Category</Label>
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger className="h-9 text-xs bg-white"><SelectValue/></SelectTrigger>
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

                    <Card className="shadow-sm border-amber-200 bg-amber-50/20">
                        <CardHeader className="py-3 px-4 border-b border-amber-100">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-2">
                                <Settings className="h-3 w-3" />
                                Security Policy
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            <div className="flex gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                <p className="text-[10px] font-medium text-amber-800 leading-normal">
                                    Files are restricted to 2MB. Authorized extensions: .PDF, .XLSX, .JPG, .PNG, .CSV, .DOCX.
                                </p>
                            </div>
                            <Separator className="bg-amber-100" />
                            <div className="space-y-1.5 text-[9px] text-amber-900/70 font-bold uppercase tracking-tight">
                                <p>1. Anti-Malware Protection Active</p>
                                <p>2. Per-User Quota Monitored</p>
                                <p>3. Authorized Business Formats Only</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="md:col-span-3 shadow-sm border-gray-200 bg-white">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold text-xs uppercase tracking-wider">File Name</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Category</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Size</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Uploaded By</TableHead>
                                    <TableHead className="text-right pr-6 font-bold text-xs uppercase tracking-wider">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground opacity-20"/></TableCell></TableRow>
                                ) : filteredFiles.map(file => (
                                    <TableRow key={file.id} className="group hover:bg-muted/30 transition-colors h-14">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                {getFileIcon(file.type)}
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm text-gray-900 line-clamp-1">{file.name}</span>
                                                    <span className="text-[10px] text-muted-foreground">{format(new Date(file.uploadedAt), 'PPp')}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[9px] uppercase font-black tracking-tight border-primary/20 bg-primary/5 text-primary">{file.category}</Badge>
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground tabular-nums">{formatSize(file.size)}</TableCell>
                                        <TableCell className="text-[11px] font-bold text-gray-700 uppercase tracking-tighter">{file.uploadedBy}</TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" asChild>
                                                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                                                        <Download className="h-4 w-4" />
                                                    </a>
                                                </Button>
                                                {hasPermission('filesystem', 'delete') && (
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-50" onClick={() => handleDelete(file)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!isLoading && filteredFiles.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-60 text-center text-muted-foreground italic">
                                            <HardDrive className="h-10 w-10 mx-auto opacity-10 mb-3"/>
                                            <p className="text-sm">Your cloud storage is empty or matches no filters.</p>
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
