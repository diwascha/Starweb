'use client';
/**
 * @fileOverview Streaming a BS-year-scoped slice of a growing collection.
 *
 * Attendance, raw machine logs and payroll all grow without bound - rows per
 * employee per month, forever - and their listeners used to attach to the
 * whole collection. Every HR screen therefore downloaded every record ever
 * imported on each mount, and the cost grew every month.
 *
 * Scoping by BS YEAR rather than by month is deliberate. A Nepali fiscal year
 * spans exactly two BS years (Shrawan of one through Ashadh of the next), and
 * the callers already work in fiscal years and already narrow to the precise
 * month client-side. A single `where('bsYear', '==', y)` equality cuts the
 * read from "all history" to "the selected year", and being equality-only it
 * needs NO composite index and no backfill of existing rows.
 */

import {
    collection,
    onSnapshot,
    query,
    where,
    type DocumentData,
    type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export interface BsYearScope {
    /** Usually the two BS years of a fiscal year. Empty streams nothing. */
    bsYears: number[];
}

/**
 * Fan a listener out over several BS years and merge the results.
 *
 * Firestore has no `IN` on a field you also want live updates for without an
 * index, so one listener per year and a merge is both simpler and cheaper than
 * a composite query. Each year's slice is held separately and the callback
 * fires with the union whenever any slice changes.
 */
export const streamByBsYear = <T>(
    getCollection: () => ReturnType<typeof collection>,
    scope: BsYearScope,
    map: (snap: QueryDocumentSnapshot<DocumentData>) => T,
    path: string,
    callback: (rows: T[]) => void
): () => void => {
    const years = Array.from(new Set(scope.bsYears.filter(y => Number.isFinite(y) && y > 0)));

    // No year selected yet: report empty rather than falling back to the whole
    // collection, which is the behaviour being removed.
    if (years.length === 0) {
        callback([]);
        return () => {};
    }

    const slices = new Map<number, T[]>();

    // Hold the first emission until every year has reported once. Otherwise the
    // caller sees one year's rows, believes loading is finished, and renders a
    // half-populated fiscal year for the moment before the other year arrives.
    // After that first complete pass, every update emits immediately.
    let primed = false;
    const emit = () => {
        if (!primed) {
            if (slices.size < years.length) return;
            primed = true;
        }
        callback(years.flatMap(y => slices.get(y) ?? []));
    };

    const unsubs = years.map(year =>
        onSnapshot(
            query(getCollection(), where('bsYear', '==', year)),
            snapshot => {
                slices.set(year, snapshot.docs.map(map));
                emit();
            },
            async (error) => {
                // Record an empty slice so one failing year cannot hold the
                // priming gate shut and leave the page loading forever.
                slices.set(year, []);
                emit();
                if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path,
                        operation: 'list'
                    }));
                }
            }
        )
    );

    return () => unsubs.forEach(u => u());
};
