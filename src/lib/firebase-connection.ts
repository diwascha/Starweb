
let resolveConnection: () => void;

export const connectionPromise: Promise<void> = new Promise<void>((resolve) => {
  resolveConnection = resolve;
});

export const signalConnectionEstablished = () => {
  if (resolveConnection) {
    resolveConnection();
  }
};
