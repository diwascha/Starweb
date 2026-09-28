import { getFirebase } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

/** Largest file accepted, matching the storage bucket's own limit. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Uploads a file to the Supabase `files` bucket and returns its public URL. */
export const uploadFile = async (file: File, path: string): Promise<string> => {
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(`File is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is 5 MB.`);
    }
    const { storage } = getFirebase();
    try {
        const snapshot = await uploadBytes(ref(storage, path), file);
        return await getDownloadURL(snapshot.ref);
    } catch (error: any) {
        console.error('Storage upload error:', error);
        if (error.code === 'storage/unauthorized') {
            throw new Error('Upload refused: your account is not approved to upload files.');
        }
        throw new Error(error.message || 'Could not upload the file.');
    }
};

/** Deletes a file by the public URL returned from uploadFile. */
export const deleteFile = async (fileUrl: string): Promise<void> => {
    const { storage } = getFirebase();
    try {
        await deleteObject(ref(storage, fileUrl));
    } catch (error) {
        console.warn('Delete file skipped: invalid URL or file not found.', error);
    }
};
