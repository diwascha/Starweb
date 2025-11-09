
let resolveConnection: () => void;

// A simple promise that acts as a gatekeeper for Firestore operations.
// It ensures that getFirestore() has been called before any service tries to use the db instance.
export const connectionPromise: Promise<void> = new Promise<void>((resolve) => {
  resolveConnection = resolve;
});

// This function will be called from firebase.ts once the db object is initialized.
export const signalConnectionEstablished = () => {
  if (resolveConnection) {
    resolveConnection();
  }
};
