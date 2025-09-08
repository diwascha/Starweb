
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Employee } from '@/lib/types';
import { deleteFile } from './storage-service';

const employeesCollection = collection(db, 'employees');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Employee => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
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

export const getEmployees = async (): Promise<Employee[]> => {
    const snapshot = await getDocs(employeesCollection);
    return snapshot.docs.map(fromFirestore);
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
        callback(snapshot.docs.map(fromFirestore));
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
