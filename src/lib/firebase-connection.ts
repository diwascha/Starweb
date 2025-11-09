
let resolveConnection: () => void;
let rejectConnection: (reason?: any) => void;

const connectionPromise = new Promise<void>((resolve, reject) => {
  resolveConnection = resolve;
  rejectConnection = reject;
});

export { connectionPromise, resolveConnection, rejectConnection };
