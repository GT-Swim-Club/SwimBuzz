"use client"

import React, { useRef, useState } from 'react';

const MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/heic': '.heic',
  'image/heif': '.heif',
}

function fileExtension(name: string): string {
  const base = name.split(/[?#]/)[0]
  const dot = base.lastIndexOf('.')
  const sep = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
  if (dot <= sep) return ''
  return base.slice(dot).toLowerCase()
}

function withInferredName(file: File): File {
  const cleaned = file.name.split(/[?#]/)[0] || file.name
  const ext = fileExtension(cleaned)
  if (ext && MIME_EXT[file.type] && ext === MIME_EXT[file.type]) {
    return cleaned === file.name ? file : new File([file], cleaned, { type: file.type })
  }
  if (ext) {
    return cleaned === file.name ? file : new File([file], cleaned, { type: file.type })
  }
  const inferred = MIME_EXT[file.type]
  if (!inferred) return file
  const base = cleaned || 'download'
  return new File([file], `${base}${inferred}`, { type: file.type || undefined })
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept.split(',').some((raw) => {
    const token = raw.trim().toLowerCase()
    if (!token) return false
    if (token.startsWith('.')) return name.endsWith(token)
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1))
    if (token === 'image/jpg') return type === 'image/jpeg' || name.endsWith('.jpg')
    return type === token || name.endsWith(`.${token.split('/').pop()}`)
  })
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isFetchableUrl(value: string): boolean {
  return isHttpUrl(value) || value.startsWith('data:') || value.startsWith('blob:')
}

function isAppOrigin(value: string): boolean {
  try {
    return new URL(value).origin === window.location.origin
  } catch {
    return false
  }
}

function unwrapDroppedUrl(value: string): string {
  if (!isHttpUrl(value)) return value
  try {
    const parsed = new URL(value)
    for (const key of ['imgurl', 'mediaurl', 'image_url', 'url', 'file']) {
      const inner = parsed.searchParams.get(key)
      if (inner && isHttpUrl(inner)) return inner
    }
  } catch {
    // Keep the original URL.
  }
  return value
}

function parseDownloadUrl(value: string): string | null {
  const first = value.indexOf(':')
  const second = value.indexOf(':', first + 1)
  if (first === -1 || second === -1) return null
  const url = value.slice(second + 1).trim()
  return isHttpUrl(url) ? url : null
}

function urlsFromHtml(html: string): string[] {
  const urls: string[] = []
  for (const match of html.matchAll(/<(?:img|source)[^>]+src=["']([^"']+)["']/gi)) {
    if (match[1]) urls.push(decodeHtml(match[1]))
  }
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    if (match[1]) urls.push(decodeHtml(match[1]))
  }
  return urls
}

const FILE_EXTS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

function fileLikeness(url: string): number {
  if (url.startsWith('data:') || url.startsWith('blob:')) return 3
  try {
    const parsed = new URL(url)
    if (FILE_EXTS.has(fileExtension(parsed.pathname))) return 2
    if (parsed.searchParams.has('imgurl') || parsed.searchParams.has('mediaurl')) return 2
  } catch {
    // Ignore invalid URLs.
  }
  return 1
}

function droppedFiles(dataTransfer: DataTransfer): File[] {
  const fromFiles = Array.from(dataTransfer.files).filter((file) => file && file.size > 0)
  if (fromFiles.length > 0) return fromFiles.map(withInferredName)

  const fromItems: File[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && file.size > 0) fromItems.push(withInferredName(file))
  }
  return fromItems
}

function droppedUrls(dataTransfer: DataTransfer): string[] {
  const pageUrls: string[] = []
  for (const line of dataTransfer.getData('text/uri-list').split('\n')) {
    const value = line.trim()
    if (value && !value.startsWith('#') && isHttpUrl(value)) pageUrls.push(value)
  }
  const plain = dataTransfer.getData('text/plain').trim()
  if (isHttpUrl(plain)) pageUrls.push(plain)

  const raw: string[] = []
  const downloadUrl = parseDownloadUrl(dataTransfer.getData('DownloadURL'))
  if (downloadUrl) raw.push(downloadUrl)
  raw.push(...urlsFromHtml(dataTransfer.getData('text/html')))
  raw.push(...pageUrls)

  const resolved: string[] = []
  for (const value of raw) {
    let url = value
    if (!isFetchableUrl(url)) {
      for (const base of pageUrls) {
        try {
          url = new URL(value, base).toString()
          break
        } catch {
          // Try the next base.
        }
      }
    }
    url = unwrapDroppedUrl(url)
    if (!isFetchableUrl(url) || isAppOrigin(url)) continue
    resolved.push(url)
  }

  const seen = new Set<string>()
  return resolved
    .filter((url) => {
      if (seen.has(url)) return false
      seen.add(url)
      return true
    })
    .sort((a, b) => fileLikeness(b) - fileLikeness(a))
}

function filenameFromResponse(url: string, response: Response, mime: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = disposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  const fromHeader = (encoded ? decodeURIComponent(encoded.replace(/["']/g, '').trim()) : null)
    ?? plain?.trim()
  if (fromHeader) return fromHeader.split(/[?#]/)[0]

  try {
    const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').split(/[?#]/)[0]
    const ext = MIME_EXT[mime] ?? ''
    if (base && fileExtension(base)) return base
    return `${base || 'download'}${ext}`
  } catch {
    return `download${MIME_EXT[mime] ?? ''}`
  }
}

function isProbablyHtml(mime: string): boolean {
  const type = mime.toLowerCase()
  return type.includes('text/html') || type.includes('application/xhtml')
}

async function fileFromClientFetch(url: string): Promise<File | null> {
  try {
    const response = await fetch(url, { referrerPolicy: 'no-referrer' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.size) return null
    const mime = blob.type || 'application/octet-stream'
    if (isProbablyHtml(mime)) return null
    return withInferredName(new File([blob], filenameFromResponse(url, response, mime), { type: mime }))
  } catch {
    return null
  }
}

async function fileFromRemoteApi(url: string): Promise<{ file: File | null; error?: string }> {
  try {
    const response = await fetch('/api/remote-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string }
      return { file: null, error: data.error || "Couldn't download that file." }
    }
    const blob = await response.blob()
    if (!blob.size) return { file: null, error: "Couldn't download that file." }
    const mime = blob.type || 'application/octet-stream'
    if (isProbablyHtml(mime)) return { file: null }
    return {
      file: withInferredName(new File([blob], filenameFromResponse(url, response, mime), { type: mime })),
    }
  } catch {
    return { file: null, error: "Couldn't download that file." }
  }
}

async function filesFromUrls(urls: string[], multiple: boolean): Promise<{ files: File[]; error?: string }> {
  const files: File[] = []
  let lastError: string | undefined
  for (const url of urls) {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      const file = await fileFromClientFetch(url)
      if (file) {
        files.push(file)
        if (!multiple) break
      }
      continue
    }

    const local = await fileFromClientFetch(url)
    if (local) {
      files.push(local)
      if (!multiple) break
      continue
    }

    const remote = await fileFromRemoteApi(url)
    lastError = remote.error
    if (remote.file) {
      files.push(remote.file)
      if (!multiple) break
    }
  }
  return {
    files,
    error: files.length
      ? undefined
      : lastError || "This site wouldn't let us download that file. Save it, then drop it here.",
  }
}

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface FileDropzoneContentProps {
  fileName?: string | null;
  emptyLabel: string;
  uploading?: boolean;
  uploadingLabel?: string;
  onRemove?: () => void;
}

export function fileDropzoneSurfaceClassName(
  hasFile: boolean,
  uploading = false,
  className = ''
) {
  const stateClass =
    uploading || !hasFile
      ? 'border-dashed p-4 text-center hover:bg-fill-secondary'
      : 'bg-fill-secondary p-2 hover:bg-fill-tertiary';

  return [
    'block w-full rounded-lg border border-border text-xs text-foreground transition-colors',
    stateClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export const FileDropzoneContent: React.FC<FileDropzoneContentProps> = ({
  fileName,
  emptyLabel,
  uploading = false,
  uploadingLabel = 'Uploading...',
  onRemove,
}) => {
  if (uploading) return <span>{uploadingLabel}</span>;
  if (!fileName) return <span>{emptyLabel}</span>;

  return (
    <div className="flex min-w-0 items-center gap-2 text-left">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 7h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4m6 0V5a3 3 0 0 0-6 0v2m6 0H9"
          />
        </svg>
      </div>
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={fileName}>
        {fileName}
      </p>
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-red-500/10 hover:text-red-500"
          aria-label={`Remove ${fileName}`}
          title="Remove file"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
};

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFilesSelected,
  accept,
  multiple,
  disabled = false,
  className,
  children,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const emitFiles = (files: File[]) => {
    const accepted = files.filter((file) => matchesAccept(file, accept));
    if (accepted.length === 0) {
      setDropError(files.length > 0 ? "This file type isn't supported here." : null);
      return;
    }
    onFilesSelected(accepted);
  };

  const openFileDialog = () => {
    if (disabled || isResolving) return;
    setDropError(null);
    fileInputRef.current?.click();
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    if (disabled || isResolving) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (!disabled && !isResolving) event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled || isResolving) return;

    const files = droppedFiles(event.dataTransfer);
    const urls = droppedUrls(event.dataTransfer);
    setDropError(null);

    if (files.length > 0) {
      emitFiles(files);
      return;
    }

    if (urls.length === 0) return;

    setIsResolving(true);
    void filesFromUrls(urls, Boolean(multiple))
      .then(({ files: resolved, error }) => {
        if (resolved.length === 0) {
          setDropError(error || "This site wouldn't let us download that file. Save it, then drop it here.")
          return
        }
        emitFiles(resolved)
      })
      .catch(() => {
        setDropError("This site wouldn't let us download that file. Save it, then drop it here.")
      })
      .finally(() => {
        setIsResolving(false);
      });
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setDropError(null);
      emitFiles(Array.from(event.target.files).map(withInferredName));
    }
  };

  const highlighted = isDragging || isResolving;

  return (
    <div
      className={[
        'relative transition-[border-color,background-color,box-shadow] duration-150',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : isResolving
            ? 'cursor-wait'
            : 'cursor-pointer hover:border-primary/60',
        highlighted
          ? 'border !border-primary !bg-primary/10 shadow-sm ring-2 !ring-primary/30'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={openFileDialog}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleInputChange}
        accept={accept}
        multiple={multiple}
        className="hidden"
      />
      {children}
      {isResolving ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background/70 text-xs text-foreground">
          Downloading…
        </div>
      ) : null}
      {dropError ? (
        <p className="mt-2 text-xs text-error">{dropError}</p>
      ) : null}
    </div>
  );
};
