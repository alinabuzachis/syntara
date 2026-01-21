import {
  type DropEvent,
  HelperText,
  HelperTextItem,
  MultipleFileUpload,
  MultipleFileUploadMain,
  MultipleFileUploadStatus,
} from '@patternfly/react-core'
import { RhUiUploadIcon } from '@patternfly/react-icons'
import { useState } from 'react'

import { FileUploadItem, type FileUploadItemProps } from './FileUploadItem'

export interface UploadedFile {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  errorMessage?: string
}

export interface FileUploadProps {
  onFilesSelected?: (files: File[]) => void
  onFileRemove?: (fileId: string) => void
  maxFiles?: number
  maxSizeBytes?: number
  maxSizeMB?: number
  acceptedMimeTypes?: string[]
  files?: UploadedFile[]
  titleText?: string
  infoText?: string
  browseButtonText?: string
  className?: string
  'aria-label'?: string
}

function formatAcceptProp(acceptedMimeTypes?: string[]): Record<string, string[]> | undefined {
  if (!acceptedMimeTypes || acceptedMimeTypes.length === 0) {
    return undefined
  }

  const acceptObj: Record<string, string[]> = {}
  for (const type of acceptedMimeTypes) {
    if (type.startsWith('.')) {
      acceptObj['application/octet-stream'] = acceptObj['application/octet-stream'] || []
      acceptObj['application/octet-stream'].push(type)
    } else {
      acceptObj[type] = acceptObj[type] || []
    }
  }
  return acceptObj
}

function formatAcceptedTypesForDisplay(acceptedMimeTypes?: string[]): string | null {
  if (!acceptedMimeTypes || acceptedMimeTypes.length === 0) {
    return null
  }
  return acceptedMimeTypes
    .map((type) => {
      if (type.startsWith('.')) return type.slice(1).toUpperCase()
      if (type.endsWith('/*')) return type.slice(0, -2)
      return type.split('/')[1]?.toUpperCase() ?? type
    })
    .join(', ')
}

export function FileUpload({
  onFilesSelected,
  onFileRemove,
  maxFiles,
  maxSizeBytes,
  maxSizeMB,
  acceptedMimeTypes,
  files: controlledFiles,
  titleText = 'Drag and drop files here',
  infoText,
  browseButtonText = 'Upload',
  className,
  'aria-label': ariaLabel,
}: FileUploadProps) {
  const [internalFiles, setInternalFiles] = useState<UploadedFile[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const uploadedFiles = controlledFiles ?? internalFiles
  const isControlled = controlledFiles !== undefined
  const effectiveMaxSizeBytes = maxSizeMB ? maxSizeMB * 1024 * 1024 : maxSizeBytes

  const handleDropRejected = (
    fileRejections: { file: File; errors: readonly { code: string; message: string }[] }[]
  ) => {
    if (fileRejections.length === 0) return

    const firstRejection = fileRejections[0]
    const errorCode = firstRejection.errors[0]?.code
    let message: string

    switch (errorCode) {
      case 'file-too-large': {
        const limitMB = effectiveMaxSizeBytes ? (effectiveMaxSizeBytes / (1024 * 1024)).toFixed(1) : '?'
        message = `"${firstRejection.file.name}" exceeds ${limitMB}MB limit`
        break
      }
      case 'file-invalid-type': {
        const typeList = formatAcceptedTypesForDisplay(acceptedMimeTypes) ?? 'accepted types'
        message = `Only ${typeList} files are allowed`
        break
      }
      case 'too-many-files':
        message = `Only ${maxFiles} file${maxFiles !== 1 ? 's' : ''} allowed`
        break
      default:
        message = firstRejection.errors[0]?.message ?? 'File rejected'
    }
    setErrorMessage(message)
  }

  const handleFileDrop = (_event: DropEvent, droppedFiles: File[]) => {
    setErrorMessage(null)
    if (droppedFiles.length === 0) return

    const currentFileNames = uploadedFiles.map((f) => f.file.name)
    const reUploadNames = droppedFiles.filter((file) => currentFileNames.includes(file.name)).map((f) => f.name)

    const newFiles: UploadedFile[] = droppedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'pending' as const,
    }))

    if (!isControlled) {
      setInternalFiles((prev) => [...prev.filter((f) => !reUploadNames.includes(f.file.name)), ...newFiles])
    }
    onFilesSelected?.(droppedFiles)
  }

  const handleFileRemove = (fileId: string) => {
    setErrorMessage(null)
    if (!isControlled) {
      setInternalFiles((prev) => prev.filter((f) => f.id !== fileId))
    }
    onFileRemove?.(fileId)
  }

  const dropzoneProps = {
    accept: formatAcceptProp(acceptedMimeTypes),
    maxSize: effectiveMaxSizeBytes,
    maxFiles: maxFiles,
    onDropRejected: handleDropRejected,
  }

  const successCount = uploadedFiles.filter((f) => f.status === 'success').length
  const hasErrors = uploadedFiles.some((f) => f.status === 'error')
  const allSuccess = uploadedFiles.length > 0 && uploadedFiles.every((f) => f.status === 'success')
  const statusToggleText =
    uploadedFiles.length > 0 ? `${successCount}/${uploadedFiles.length} files uploaded` : undefined
  const statusToggleIcon = hasErrors ? 'danger' : allSuccess ? 'success' : 'inProgress'
  const acceptedTypesDisplay = formatAcceptedTypesForDisplay(acceptedMimeTypes)
  const resolvedInfoText =
    infoText ?? (acceptedTypesDisplay ? `Accepted file types: ${acceptedTypesDisplay}` : undefined)

  return (
    <MultipleFileUpload onFileDrop={handleFileDrop} dropzoneProps={dropzoneProps} isHorizontal className={className}>
      <MultipleFileUploadMain
        titleIcon={<RhUiUploadIcon />}
        titleText={titleText}
        titleTextSeparator="or"
        infoText={resolvedInfoText}
        browseButtonText={browseButtonText}
      />
      {errorMessage && (
        <HelperText>
          <HelperTextItem variant="error">{errorMessage}</HelperTextItem>
        </HelperText>
      )}
      {uploadedFiles.length > 0 && (
        <MultipleFileUploadStatus
          statusToggleText={statusToggleText}
          statusToggleIcon={statusToggleIcon}
          aria-label={ariaLabel ?? 'Uploaded files'}
        >
          {uploadedFiles.map((uploadedFile) => (
            <FileUploadItem
              key={uploadedFile.id}
              file={uploadedFile.file}
              fileId={uploadedFile.id}
              status={uploadedFile.status}
              progress={uploadedFile.progress}
              errorMessage={uploadedFile.errorMessage}
              onRemove={() => handleFileRemove(uploadedFile.id)}
            />
          ))}
        </MultipleFileUploadStatus>
      )}
    </MultipleFileUpload>
  )
}

export type { FileUploadItemProps }
