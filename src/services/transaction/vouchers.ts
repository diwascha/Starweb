import { getFirebase } from '@/lib/firebase';
import { doc, writeBatch, query, where, getDocs, getDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { transactionsCollection, fromFirestore } from './data';

export const getVoucherTransactions = async (voucherId: string) => {
    const q = query(transactionsCollection(), where("voucherId", "==", voucherId));
    const snap = await getDocs(q);
    return snap.docs.map(fromFirestore);
};

export const saveVoucher = async (data: any, createdBy: string) => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    const voucherId = doc(transactionsCollection()).id;
    const now = createTimestamp();
    data.items.forEach((item: any) => {
        const ref = doc(transactionsCollection());
        batch.set(ref, { voucherId, date: data.date.toISOString(), createdBy, createdAt: now, ...item });
    });
    await batch.commit();
};

export const deleteVoucher = async (voucherId: string) => {
    const txns = await getVoucherTransactions(voucherId);
    const { db } = getFirebase();
    const batch = writeBatch(db);
    txns.forEach(t => batch.delete(doc(db, COLLECTIONS.TRANSACTIONS, t.id)));
    await batch.commit();
};
