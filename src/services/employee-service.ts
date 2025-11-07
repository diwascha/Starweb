
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc } from 'firebase/firestore';
import type { Employee } from '@/lib/types';
import { deleteFile } from './storage-service';

const employeesCollection = collection(db, 'employees');

const isValidEmployeeName = (name: string): boolean => {
    if (!name || typeof name !== 'string') return false;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return false;

    // Reject names that are just numbers or look like dates/times
    if (/^\d+$/.test(trimmedName)) return false;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmedName)) return false; // HH:mm:ss
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmedName)) return false; // MM/DD/YYYY
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmedName)) return false; // YYYY-MM-DD
    if (trimmedName.toLowerCase().includes('gmt')) return false; // Full date strings

    return true;
};


const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Employee => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        status: data.status || 'Working', // Default to 'Working' if status is not set
        department: data.department,
        position: data.position,
        wageBasis: data.wageBasis,
        wageAmount: data.wageAmount,
        allowance: data.allowance,
        address: data.address,
        gender: data.gender,
        mobileNumber: data.mobileNumber,
        dateOfBirth: data.dateOfBirth,
        joiningDate: data.joiningDate,
        identityType: data.identityType,
        documentNumber: data.documentNumber,
        referredBy: data.referredBy,
        photoURL: data.photoURL,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getEmployees = async (forceFetch: boolean = false): Promise<Employee[]> => {
    const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
    if (isDesktop && !forceFetch) {
        return [];
    }
    const snapshot = await getDocs(employeesCollection);
    return snapshot.docs.map(fromFirestore).filter(emp => isValidEmployeeName(emp.name));
};

export const getEmployee = async (id: string): Promise<Employee | null> => {
    const employeeDoc = doc(db, 'employees', id);
    const docSnap = await getDoc(employeeDoc);
    if (docSnap.exists()) {
        const employee = fromFirestore(docSnap);
        return isValidEmployeeName(employee.name) ? employee : null;
    }
    return null;
};


export const addEmployee = async (employee: Omit<Employee, 'id'>): Promise<string> => {
    const docRef = await addDoc(employeesCollection, {
        ...employee,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onEmployeesUpdate = (callback: (employees: Employee[]) => void): () => void => {
    return onSnapshot(employeesCollection, (snapshot) => {
        const validEmployees = snapshot.docs.map(fromFirestore).filter(emp => isValidEmployeeName(emp.name));
        callback(validEmployees);
    });
};

export const updateEmployee = async (id: string, employee: Partial<Omit<Employee, 'id'>>): Promise<void> => {
    const employeeDoc = doc(db, 'employees', id);
    await updateDoc(employeeDoc, {
        ...employee,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteEmployee = async (id: string, photoURL?: string): Promise<void> => {
    if (photoURL) {
        try {
            await deleteFile(photoURL);
        } catch (error) {
            console.error("Failed to delete employee photo from storage:", error);
            // Don't block employee deletion if photo deletion fails
        }
    }
    const employeeDoc = doc(db, 'employees', id);
    await deleteDoc(employeeDoc);
};
