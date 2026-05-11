export type UploadedFile = {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  errorMessage?: string
}

export function computeUploadStatusProps(files: UploadedFile[]): {
  statusToggleText: string | undefined
  statusToggleIcon: 'danger' | 'success' | 'inProgress'
} {
  const successCount = files.filter((f) => f.status === 'success').length
  const hasErrors = files.some((f) => f.status === 'error')
  const allSuccess = files.length > 0 && files.every((f) => f.status === 'success')
  const statusToggleText = files.length > 0 ? `${successCount}/${files.length} files uploaded` : undefined
  let statusToggleIcon: 'danger' | 'success' | 'inProgress' = 'inProgress'
  if (hasErrors) {
    statusToggleIcon = 'danger'
  } else if (allSuccess) {
    statusToggleIcon = 'success'
  }
  return { statusToggleText, statusToggleIcon }
}

export type FileRejection = { file: File; errors: readonly { code: string; message: string }[] }

export function formatAcceptedTypesForDisplay(acceptedMimeTypes?: string[]): string | null {
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

export function createDropRejectedHandler(options: {
  setErrorMessage: (msg: string | null) => void
  effectiveMaxSizeBytes: number | undefined
  acceptedMimeTypes: string[] | undefined
  maxFiles: number | undefined
}): (fileRejections: FileRejection[]) => void {
  const { setErrorMessage, effectiveMaxSizeBytes, acceptedMimeTypes, maxFiles } = options
  return (fileRejections: FileRejection[]) => {
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
}
