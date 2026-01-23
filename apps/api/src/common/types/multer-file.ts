export interface MulterFile {
  /** Original filename on the user's computer */
  originalname: string;
  /** MIME type provided by multer */
  mimetype: string;
  /** File size in bytes */
  size: number;

  /** If using memoryStorage */
  buffer?: Buffer;

  /** If using diskStorage */
  path?: string;
  filename?: string;

  /** Extra fields that multer may add */
  [key: string]: any;
}
