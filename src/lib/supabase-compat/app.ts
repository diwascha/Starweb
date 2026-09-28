/** @fileOverview `firebase/app` stand-in: apps are just names now (see ./auth). */
export type FirebaseApp = { name: string; options?: unknown };
const apps: FirebaseApp[] = [];
export const initializeApp = (options?: unknown, name = '[DEFAULT]'): FirebaseApp => {
    const existing = apps.find(a => a.name === name);
    if (existing) return existing;
    const app = { name, options };
    apps.push(app);
    return app;
};
export const getApps = () => apps.slice();
export const getApp = (name = '[DEFAULT]') => apps.find(a => a.name === name) ?? initializeApp(undefined, name);
export const deleteApp = async (app: FirebaseApp) => {
    const i = apps.indexOf(app);
    if (i >= 0) apps.splice(i, 1);
};
