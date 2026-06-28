'use client';
/**
 * @fileOverview Central event emitter for propagating asynchronous Firestore errors to the UI.
 */

type ErrorCallback = (error: any) => void;

class SimpleEmitter {
  private listeners: { [key: string]: ErrorCallback[] } = {};

  /**
   * Registers a listener for a specific error channel.
   * Returns an unsubscribe function.
   */
  on(event: string, callback: ErrorCallback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Emits an error to all registered listeners on the given channel.
   */
  emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

export const errorEmitter = new SimpleEmitter();
