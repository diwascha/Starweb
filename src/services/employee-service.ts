
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Employee } from '@/lib/types';

const employeesCollection = collection(db, 'employees');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Employee => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        wageBasis: data.wageBasis,
        wageAmount: data.wageAmount,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const addEmployee = async (employee: Omit<Employee, 'id'>): Promise<string> => {
    const docRef = await addDoc(employeesCollection, employee);
    return docRef.id;
};

export const getEmployees = async (): Promise<Employee[]> => {
    const snapshot = await getDocs(employeesCollection);
    return snapshot.docs.map(fromFirestore);
};

export const updateEmployee = async (id: string, employee: Partial<Omit<Employee, 'id'>>): Promise<void> => {
    const employeeDoc = doc(db, 'employees', id);
    await updateDoc(employeeDoc, employee);
};

export const deleteEmployee = async (id: string): Promise<void> => {
    const employeeDoc = doc(db, 'employees', id);
    await deleteDoc(employeeDoc);
};
