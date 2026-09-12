import { getFirebase } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage.
 *
 * IMPORTANT: Firebase Storage requires the Blaze (pay-as-you-go) plan for
 * projects created since late 2024. On the free Spark plan there is no bucket,
 * so every call here fails and the file screen cannot work at all. The error
 * mapping below says that in plain words rather than surfacing a raw SDK code,
 * because "storage/unknown" sends people hunting for a bug that is really a
 * billing setting.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
    const { storage } = getFirebase();
    const storageRef = ref(storage, path);
    
    try {
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error: any) {
        console.error("Firebase Storage Error:", error);
        
        // Human-readable error mapping for common setup issues
        if (error.code === 'storage/unauthorized') {
            throw new Error(`Security Denied: Please check your Firebase Storage Rules. You may need to enable the service in the Firebase Console.`);
        }
        if (error.code === 'storage/retry-limit-exceeded' || error.message?.includes('CORS')) {
            throw new Error(`Connection Blocked (CORS): Firebase Storage requires your domain to be authorized in the Google Cloud Console.`);
        }
        if (error.status === 403) {
            throw new Error(`Access Forbidden: Ensure your Firebase project is not over its daily free-tier limit or has Storage enabled.`);
        }
        // No bucket at all - the usual cause is the project still being on the
        // free plan, where Storage is not provisioned.
        if (error.code === 'storage/unknown' || error.code === 'storage/bucket-not-found'
            || error.code === 'storage/project-not-found') {
            throw new Error(
                'File storage is not enabled for this project. Firebase Storage needs the ' +
                'Blaze plan; on the free plan there is no bucket to upload to. Everything ' +
                'else in the app is unaffected.'
            );
        }

        throw new Error(error.message || "Failed to communicate with Cloud Storage.");
    }
};

export const deleteFile = async (fileUrl: string): Promise<void> => {
    const { storage } = getFirebase();
    try {
        const decodedUrl = decodeURIComponent(fileUrl);
        const pathStart = decodedUrl.indexOf('/o/') + 3;
        const pathEnd = decodedUrl.indexOf('?');
        const path = decodedUrl.substring(pathStart, pathEnd);
        
        const storageRef = ref(storage, path);
        await deleteObject(storageRef);
    } catch (error) {
        console.warn("Delete file skipped: Invalid URL or file not found.", error);
    }
};
