// Minimal module typings for Multer to satisfy TypeScript builds in production.
// We only use diskStorage/memoryStorage from NestJS interceptors; runtime uses the real JS package.
//
// Keeping this local avoids adding @types/multer (and lockfile churn) for the first internal deploy.
declare module 'multer' {
  export const diskStorage: any;
  export const memoryStorage: any;
}
