
let resolveConnection: () => void;
let rejectConnection: (reason?: any) => void;

let connectionPromise: Promise<void> | null = null;

export const createConnectionPromise = () => {
    if (!connectionPromise) {
        connectionPromise = new Promise<void>((resolve, reject) => {
            resolveConnection = resolve;
            rejectConnection = reject;

            // Timeout to prevent waiting forever
            setTimeout(() => {
                reject(new Error("Firestore connection timed out."));
            }, 30000); // 30-second timeout
        });
    }
    return connectionPromise;
};

// Initialize the promise as soon as this module is loaded.
export let connectionPromiseInstance = createConnectionPromise();

export { resolveConnection, rejectConnection };
