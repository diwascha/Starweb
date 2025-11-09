
let resolveConnection: () => void;
let rejectConnection: (reason?: any) => void;

// This promise will be awaited by all Firestore service calls.
// It is initialized once and reused across the app.
let connectionPromise: Promise<void> | null = null;

function createConnectionPromise() {
    if (!connectionPromise) {
        connectionPromise = new Promise<void>((resolve, reject) => {
            resolveConnection = resolve;
            rejectConnection = reject;
        });
    }
    return connectionPromise;
}


export { createConnectionPromise, resolveConnection, rejectConnection };
