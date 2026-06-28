/**
 * @fileOverview Custom error types for Firestore permission handling.
 */

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

/**
 * A specialized error thrown when a Firestore security rule denies a request.
 * Surfacing this error triggers the developer overlay for rapid debugging.
 */
export class FirestorePermissionError extends Error {
  context: SecurityRuleContext;
  
  constructor(context: SecurityRuleContext) {
    super(`Firestore Permission Denied: ${context.operation} on ${context.path}`);
    this.name = 'FirestorePermissionError';
    this.context = context;
    
    // Ensure the prototype is set correctly for instanceof checks in older environments
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
