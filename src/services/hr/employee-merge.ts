'use client';
/**
 * @fileOverview Merging duplicate employee records.
 *
 * Employees get duplicated when the same person is entered (or imported from
 * the attendance machine) under slightly different spellings - "Ram Bahadur"
 * vs "Ram Bahadhur". Each spelling becomes its own employee record, and that
 * person's attendance, payroll and bonus history then splits across both.
 *
 * Merging reassigns every referencing record to one surviving employee and
 * deletes the duplicates. Two details make this more than a field rename:
 *
 *  1. Some collections encode the employee in the DOCUMENT ID
 *     (payroll is `<bsYear>-<bsMonth>-<employeeId>`, bonus/behavior ledgers
 *     are `<employeeId>_<year>_<month>`, raw machine logs are
 *     `<lowercased name>_<date>`). Updating only the field would leave the
 *     old id in place, and the next payroll recalculation would then write a
 *     SECOND document at the canonical id - the merged employee would show
 *     duplicate rows for the same month. So those documents are rewritten to
 *     a new id and the old one deleted.
 *
 *  2. Rewriting an id can collide with a document the survivor already has
 *     (both spellings were paid for the same month). We never silently
 *     overwrite the survivor's own record: the duplicate's colliding document
 *     is dropped and reported, so the month can be recalculated deliberately.
 *
 * Raw machine logs are keyed by NAME rather than employee id, so they are
 * matched and re-keyed on the name instead.
 */

import { getFirebase } from '@/lib/firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    writeBatch,
} from 'firebase/firestore';
import type { Employee } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { logAudit } from '../log-service';
import { deleteEmployee } from '../employee-service';

/** How one collection points back at an employee. */
interface EmployeeLink {
    collection: string;
    label: string;
    /** Field holding the employee's id, when the collection uses one. */
    idField?: string;
    /** Field holding the employee's name, kept in sync on merge. */
    nameField?: string;
    /**
     * Collections whose document id embeds the employee id (or, for raw
     * logs, the lowercased name). Those ids are rewritten on merge.
     */
    idInDocId?: 'employeeId' | 'employeeName';
}

const EMPLOYEE_LINKS: EmployeeLink[] = [
    // Auto-generated document ids - a field update is enough.
    { collection: COLLECTIONS.ATTENDANCE, label: 'Attendance records', idField: 'employeeId', nameField: 'employeeName' },
    { collection: COLLECTIONS.LEAVE_REQUESTS, label: 'Leave requests', idField: 'employeeId', nameField: 'employeeName' },
    // Employee id baked into the document id.
    { collection: COLLECTIONS.PAYROLL, label: 'Payroll records', idField: 'employeeId', nameField: 'employeeName', idInDocId: 'employeeId' },
    { collection: COLLECTIONS.BONUS_LEDGER, label: 'Bonus ledger', idField: 'employeeId', nameField: 'employeeName', idInDocId: 'employeeId' },
    { collection: COLLECTIONS.BONUS_SUMMARIES, label: 'Bonus summaries', nameField: 'employeeName', idInDocId: 'employeeId' },
    { collection: COLLECTIONS.BEHAVIOR_LEDGER, label: 'Behaviour ledger', idField: 'employeeId', nameField: 'employeeName', idInDocId: 'employeeId' },
    { collection: COLLECTIONS.BEHAVIOR_ANALYTICS, label: 'Behaviour analytics', idField: 'employeeId', nameField: 'employeeName', idInDocId: 'employeeId' },
    // Keyed by name, not by id.
    { collection: COLLECTIONS.RAW_MACHINE_LOGS, label: 'Raw machine logs', nameField: 'employeeName', idInDocId: 'employeeName' },
];

export const normalizeEmployeeName = (name: string): string => (name || '').toLowerCase().trim();

export interface MergeLinePreview {
    label: string;
    collection: string;
    /** Documents belonging to the duplicates that will move. */
    moving: number;
    /** Documents that cannot move because the survivor already has that period. */
    conflicts: number;
}

export interface MergePreview {
    lines: MergeLinePreview[];
    totalMoving: number;
    totalConflicts: number;
}

/**
 * Finds every document belonging to `duplicate`, for one link.
 * Bonus summaries have no employeeId field at all - their document id IS the
 * employee id - so they are fetched by direct id lookup instead of a query.
 */
const findLinkedDocs = async (link: EmployeeLink, duplicate: Employee) => {
    const { db } = getFirebase();
    const col = collection(db, link.collection);

    if (link.collection === COLLECTIONS.BONUS_SUMMARIES) {
        const snap = await getDoc(doc(col, duplicate.id));
        return snap.exists() ? [snap] : [];
    }

    if (link.idInDocId === 'employeeName' || !link.idField) {
        // Raw machine logs store the name as imported, and Firestore can't
        // query case-insensitively. The collection is far too large to pull
        // down and filter client-side, so match the realistic spellings of
        // the same string instead of only the exact stored value.
        const variants = Array.from(new Set([
            duplicate.name,
            duplicate.name.trim(),
            duplicate.name.trim().toUpperCase(),
            duplicate.name.trim().toLowerCase(),
        ])).slice(0, 30); // Firestore caps `in` at 30 values
        const snap = await getDocs(query(col, where(link.nameField!, 'in', variants)));
        return snap.docs;
    }

    const snap = await getDocs(query(col, where(link.idField, '==', duplicate.id)));
    return snap.docs;
};

/**
 * Works out the document's id after the merge. Returns the same id when the
 * employee isn't part of it (auto-generated ids, or an import that used its
 * own id format) - those documents keep their id and only get field updates.
 */
const rewriteDocId = (docId: string, link: EmployeeLink, primary: Employee, duplicate: Employee): string => {
    if (!link.idInDocId) return docId;
    const needle = link.idInDocId === 'employeeName'
        ? normalizeEmployeeName(duplicate.name)
        : duplicate.id;
    const replacement = link.idInDocId === 'employeeName'
        ? normalizeEmployeeName(primary.name)
        : primary.id;
    if (!needle || !docId.includes(needle)) return docId;
    return docId.split(needle).join(replacement);
};

/**
 * Counts what a merge would move, without writing anything. Runs before the
 * confirmation prompt so the operator sees the blast radius of an
 * irreversible operation on live payroll data.
 */
export const previewEmployeeMerge = async (
    primary: Employee,
    duplicates: Employee[],
): Promise<MergePreview> => {
    const { db } = getFirebase();
    const lines: MergeLinePreview[] = [];

    for (const link of EMPLOYEE_LINKS) {
        let moving = 0;
        let conflicts = 0;
        for (const duplicate of duplicates) {
            const docs = await findLinkedDocs(link, duplicate);
            for (const d of docs) {
                const newId = rewriteDocId(d.id, link, primary, duplicate);
                if (newId !== d.id) {
                    const existing = await getDoc(doc(collection(db, link.collection), newId));
                    if (existing.exists()) {
                        conflicts++;
                        continue;
                    }
                }
                moving++;
            }
        }
        if (moving || conflicts) {
            lines.push({ label: link.label, collection: link.collection, moving, conflicts });
        }
    }

    return {
        lines,
        totalMoving: lines.reduce((sum, l) => sum + l.moving, 0),
        totalConflicts: lines.reduce((sum, l) => sum + l.conflicts, 0),
    };
};

export interface MergeResult {
    moved: number;
    conflicts: number;
    duplicatesRemoved: number;
}

/**
 * Reassigns every record belonging to `duplicates` onto `primary`, then
 * deletes the duplicate employee records. Irreversible - callers must
 * confirm with the operator first (see previewEmployeeMerge).
 */
export const mergeEmployees = async (
    primary: Employee,
    duplicates: Employee[],
    performedBy: string,
): Promise<MergeResult> => {
    const { db } = getFirebase();
    const realDuplicates = duplicates.filter(d => d.id !== primary.id);
    if (realDuplicates.length === 0) {
        throw new Error('Select at least one record to merge into the surviving employee.');
    }

    let moved = 0;
    let conflicts = 0;
    const CHUNK = 200; // each moved doc can cost two writes (set + delete)

    for (const link of EMPLOYEE_LINKS) {
        for (const duplicate of realDuplicates) {
            const docs = await findLinkedDocs(link, duplicate);
            const col = collection(db, link.collection);

            for (let i = 0; i < docs.length; i += CHUNK) {
                const batch = writeBatch(db);
                let batched = 0;

                for (const d of docs.slice(i, i + CHUNK)) {
                    const data = d.data();
                    const patch: Record<string, string> = {};
                    if (link.idField) patch[link.idField] = primary.id;
                    if (link.nameField) patch[link.nameField] = primary.name;
                    // Payroll rows carry their own ownership. Leaving the
                    // duplicate's value behind would park the survivor's
                    // history under an ownership scope their employee record
                    // no longer has, hiding it from the people who own them.
                    // Only set it where the document already has the field.
                    if (data.ownership !== undefined && primary.ownership) {
                        patch.ownership = primary.ownership;
                    }

                    const newId = rewriteDocId(d.id, link, primary, duplicate);

                    if (newId === d.id) {
                        batch.update(doc(col, d.id), patch);
                        batched++;
                        moved++;
                        continue;
                    }

                    // Never overwrite a record the survivor already owns.
                    const existing = await getDoc(doc(col, newId));
                    if (existing.exists()) {
                        conflicts++;
                        continue;
                    }

                    batch.set(doc(col, newId), { ...data, ...patch });
                    batch.delete(doc(col, d.id));
                    batched++;
                    moved++;
                }

                if (batched > 0) await batch.commit();
            }
        }
    }

    for (const duplicate of realDuplicates) {
        await deleteEmployee(duplicate.id, duplicate.photoURL);
    }

    await logAudit(
        `Merged ${realDuplicates.length} duplicate employee record(s) into "${primary.name}": `
        + `${realDuplicates.map(d => d.name).join(', ')}. `
        + `${moved} linked record(s) reassigned, ${conflicts} conflict(s) skipped.`,
        'HR',
        { id: primary.id, performedBy },
    );

    return { moved, conflicts, duplicatesRemoved: realDuplicates.length };
};
