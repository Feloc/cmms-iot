'use client';

import { useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  accept?: string;
  disabled?: boolean;
  label: string;
  multiple?: boolean;
  onFiles: (files: FileList) => void | Promise<void>;
};

function fileSummary(files: FileList | null) {
  if (!files || files.length === 0) return 'Sin archivos seleccionados';
  if (files.length === 1) return files[0]?.name ?? '1 archivo seleccionado';
  return `${files.length} archivos seleccionados`;
}

export function AttachmentFilePicker({ accept, disabled, label, multiple = true, onFiles }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [summary, setSummary] = useState('Sin archivos seleccionados');

  async function handleChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSummary(fileSummary(files));
    await onFiles(files);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className={cn(
          'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition-all duration-150',
          'hover:-translate-y-0.5 hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.98]',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-gray-300 focus-within:ring-offset-1',
          disabled && 'pointer-events-none translate-y-0 cursor-not-allowed opacity-50 shadow-none',
        )}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple={multiple}
          accept={accept}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.files)}
          className="sr-only"
        />
      </label>
      <div className="max-w-[260px] truncate text-xs text-gray-500" title={summary}>
        {disabled ? 'Procesando archivos...' : summary}
      </div>
    </div>
  );
}
