/**
 * Minimal shape of the file object provided by Multer when using
 * NestJS FileInterceptor / UploadedFile().
 *
 * We define this locally to avoid depending on Express/Multer global
 * type augmentations during TypeScript compilation in production builds.
 */
export type MulterFile = {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
  filename?: string;
  destination?: string;
};
