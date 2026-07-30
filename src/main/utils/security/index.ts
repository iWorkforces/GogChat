/**
 * security/ — public API surface for the security utility cluster.
 *
 * Convention: prefer deep imports (`utils/security/<module>.js`) at call sites
 * for tree-shaking and explicit dependencies. This index.ts documents the
 * exported API of the cluster and is the supported import surface.
 */

export * from './shellWrapper.js';
export * from './secureFlags.js';
export * from './encryptionKey.js';
export * from './cspHeaderHandler.js';
export * from './permissionHandler.js';
export * from './mediaAccess.js';
export * from './notificationAccess.js';
