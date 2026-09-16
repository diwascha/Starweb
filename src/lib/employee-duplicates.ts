/**
 * @fileOverview Finding employee records that are really the same person.
 *
 * Duplicates here come from spelling drift, not from re-entering an identical
 * name: the attendance machine exports "Ram Bahadhur", someone types "Ram
 * Bahadur", and both become employee records. So an exact-match check finds
 * nothing useful - the comparison has to tolerate a character or two of
 * difference, transposed words ("Bahadur Ram"), and inconsistent spacing or
 * punctuation.
 */

import type { Employee } from '@/lib/types';

/** Lowercases, strips punctuation, and collapses whitespace. */
const canonical = (name: string): string =>
    (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** Same words in any order - catches "Ram Bahadur" vs "Bahadur Ram". */
const sortedWords = (name: string): string =>
    canonical(name).split(' ').filter(Boolean).sort().join(' ');

/** Standard Levenshtein edit distance, iterative single-row implementation. */
const editDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const curr = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        prev = curr;
    }
    return prev[b.length];
};

/**
 * Similarity between two names, 0 to 1. Compares both the canonical form and
 * the word-sorted form, keeping whichever scores higher, so a reordered name
 * isn't penalised for the reordering.
 */
export const nameSimilarity = (a: string, b: string): number => {
    const score = (x: string, y: string) => {
        if (!x || !y) return 0;
        if (x === y) return 1;
        const longest = Math.max(x.length, y.length);
        return 1 - editDistance(x, y) / longest;
    };
    return Math.max(
        score(canonical(a), canonical(b)),
        score(sortedWords(a), sortedWords(b)),
    );
};

export interface DuplicateGroup {
    /** Employees that look like the same person, most-complete record first. */
    members: Employee[];
    /** Lowest pairwise similarity in the group, as a confidence signal. */
    similarity: number;
}

/**
 * How much real data a record carries. The richest record is offered as the
 * default survivor in a merge, since it's the one least likely to lose
 * information.
 */
const completeness = (e: Employee): number => {
    const fields = [
        e.mobileNumber, e.email, e.address, e.dateOfBirth, e.joiningDate,
        e.documentNumber, e.photoURL, e.department, e.position,
        e.emergencyContactNumber, e.qualification,
    ];
    const filled = fields.filter(Boolean).length;
    return filled + (e.wageAmount ? 1 : 0) + (e.documents?.length ? 1 : 0);
};

/**
 * Groups employees whose names are similar enough to be worth reviewing.
 *
 * Deliberately a suggestion, not a verdict: grouping is transitive (A~B and
 * B~C puts all three together) which can over-group short names, so the UI
 * always shows the members and lets a person confirm before anything merges.
 */
export const findDuplicateGroups = (
    employees: Employee[],
    threshold = 0.82,
): DuplicateGroup[] => {
    const groups: Employee[][] = [];
    const seen = new Set<string>();

    for (let i = 0; i < employees.length; i++) {
        if (seen.has(employees[i].id)) continue;
        const group = [employees[i]];
        seen.add(employees[i].id);

        for (let j = i + 1; j < employees.length; j++) {
            if (seen.has(employees[j].id)) continue;
            const matches = group.some(m => nameSimilarity(m.name, employees[j].name) >= threshold);
            if (matches) {
                group.push(employees[j]);
                seen.add(employees[j].id);
            }
        }

        if (group.length > 1) groups.push(group);
    }

    return groups
        .map(members => {
            let lowest = 1;
            for (let a = 0; a < members.length; a++) {
                for (let b = a + 1; b < members.length; b++) {
                    lowest = Math.min(lowest, nameSimilarity(members[a].name, members[b].name));
                }
            }
            return {
                members: [...members].sort((x, y) => completeness(y) - completeness(x)),
                similarity: lowest,
            };
        })
        .sort((a, b) => b.similarity - a.similarity);
};

/** The record a merge should default to keeping: the most complete one. */
export const suggestSurvivor = (members: Employee[]): Employee =>
    [...members].sort((a, b) => completeness(b) - completeness(a))[0];
