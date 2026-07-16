import { Button, Content, ContentVariants, Flex, FlexItem, Progress, ProgressSize } from '@patternfly/react-core'
import { RhUiDocumentFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'

export type FileUploadItemProps = {
  file: File
  fileId: string
  fileSize?: number
  status?: 'pending' | 'uploading' | 'success' | 'error'
  progress?: number
  errorMessage?: string
  fileName?: string
  onRemove?: () => void
  className?: string
  removeButtonAriaLabel?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toUpperCase()
  return ext ?? 'FILE'
}

export function FileUploadItem({
  file,
  fileSize,
  status = 'pending',
  progress,
  errorMessage,
  fileName,
  onRemove,
  className,
  removeButtonAriaLabel = 'Remove file',
}: FileUploadItemProps) {
  const displayName = fileName ?? file.name
  const isError = status === 'error'
  const isSuccess = status === 'success'
  const fileExtension = getFileExtension(file.name)

  const getProgressVariant = () => {
    if (isError) return 'danger'
    if (isSuccess) return 'success'
    return undefined
  }

  const showProgress = progress !== undefined && status !== 'pending'

  return (
    <div
      className={className}
      style={{
        padding: 'var(--pf-t--global--spacer--sm) var(--pf-t--global--spacer--md)',
        backgroundColor: 'var(--pf-t--global--background--color--floating--default)',
        border: '1px solid var(--pf-t--global--border--color--default)',
        borderRadius: 'var(--pf-t--global--border--radius--small)',
        marginTop: 'var(--pf-t--global--spacer--sm)',
      }}
    >
      <Flex alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem>
          <RhUiDocumentFillIcon
            style={{
              color: isError
                ? 'var(--pf-t--global--color--status--danger--default)'
                : 'var(--pf-t--global--color--brand--default)',
              fontSize: 'var(--pf-t--global--icon--size--lg)',
            }}
          />
        </FlexItem>
        <FlexItem flex={{ default: 'flex_1' }}>
          <Content
            component={ContentVariants.p}
            style={{
              color: isError
                ? 'var(--pf-t--global--color--status--danger--default)'
                : 'var(--pf-t--global--text--color--regular)',
            }}
          >
            {displayName}
          </Content>
          <Content component={ContentVariants.small} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
            {fileExtension} | {formatFileSize(fileSize ?? file.size)}
            {isError && errorMessage && ` - ${errorMessage}`}
          </Content>
        </FlexItem>
        <FlexItem>
          <Button variant="plain" aria-label={removeButtonAriaLabel} onClick={onRemove} size="sm">
            <RhUiTrashIcon />
          </Button>
        </FlexItem>
      </Flex>

      {showProgress && (
        <div style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
          <Progress
            value={progress}
            size={ProgressSize.sm}
            variant={getProgressVariant()}
            measureLocation="outside"
            aria-label={`${displayName} upload progress`}
          />
        </div>
      )}
    </div>
  )
}
