/**
 * @fileOverview `firebase/storage`, implemented on Supabase Storage (bucket
 * `files`). Download URLs are the bucket's public URLs.
 */
import { getSupabase } from '@/lib/supabase';

export const BUCKET = 'files';
export type FirebaseStorage = { type: 'storage' };
export type StorageReference = { fullPath: string; name: string };

export class StorageError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
}

export const getStorage = (_app?: unknown): FirebaseStorage => ({ type: 'storage' });

/** `path` may also be a public URL from this bucket (used when deleting). */
export const ref = (_storage: FirebaseStorage, path: string): StorageReference => {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const clean = path.includes(marker) ? decodeURIComponent(path.split(marker)[1].split('?')[0]) : path;
    return { fullPath: clean, name: clean.split('/').pop() || clean };
};

export async function uploadBytes(r: StorageReference, data: Blob | ArrayBuffer | Uint8Array) {
    const { error } = await getSupabase().storage.from(BUCKET).upload(r.fullPath, data, { upsert: true });
    if (error) throw new StorageError(/row-level security|unauthorized|denied/i.test(error.message) ? 'storage/unauthorized' : 'storage/unknown', error.message);
    return { ref: r, metadata: { fullPath: r.fullPath } };
}

export async function getDownloadURL(r: StorageReference): Promise<string> {
    return getSupabase().storage.from(BUCKET).getPublicUrl(r.fullPath).data.publicUrl;
}

export async function deleteObject(r: StorageReference): Promise<void> {
    const { error } = await getSupabase().storage.from(BUCKET).remove([r.fullPath]);
    if (error) throw new StorageError('storage/unknown', error.message);
}
