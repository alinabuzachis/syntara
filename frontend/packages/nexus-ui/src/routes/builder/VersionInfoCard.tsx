import {
  Card,
  CardBody,
  CardTitle,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Stack,
  StackItem,
  Tooltip,
} from '@patternfly/react-core'
import { useCallback, useRef, useState } from 'react'

import { formatHistoryDateTime } from './historyDateUtils'
import styles from './VersionInfoCard.module.css'

const ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*(?:Z|[+-]\d{2}:\d{2})?/

function formatSourceInfo(text: string): string {
  const match = ISO_DATE_PATTERN.exec(text)
  if (match) {
    return text.replace(match[0], formatHistoryDateTime(match[0]))
  }
  return text
}

type VersionInfoCardProps = Readonly<{
  title?: string | null
  date?: string | null
  description?: string | null
  publishedAt?: string | null
  unpublishedAt?: string | null
}>

function useTruncationTooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const checkTruncation = useCallback(() => {
    const el = ref.current
    if (el) setIsTruncated(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
  }, [])
  return { ref, isTruncated, onMouseEnter: checkTruncation }
}

function TruncatedText({
  text,
  variant,
  className,
}: Readonly<{ text: string; variant: 'small' | 'p'; className: string }>) {
  const { ref, isTruncated, onMouseEnter } = useTruncationTooltip()
  const content = (
    <Content
      ref={ref}
      component={variant === 'small' ? ContentVariants.small : ContentVariants.p}
      className={className}
      onMouseEnter={onMouseEnter}
    >
      {text}
    </Content>
  )
  return isTruncated ? <Tooltip content={text}>{content}</Tooltip> : content
}

function TimestampRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <StackItem>
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
        <FlexItem>
          <Content component={ContentVariants.p} className={styles.timestampLabel}>
            {label}
          </Content>
        </FlexItem>
        <FlexItem>
          <Content component={ContentVariants.p}>{value}</Content>
        </FlexItem>
      </Flex>
    </StackItem>
  )
}

function TimestampItems({
  formattedDate,
  publishedAt,
  unpublishedAt,
}: Readonly<{ formattedDate: string | null; publishedAt?: string | null; unpublishedAt?: string | null }>) {
  return (
    <>
      {formattedDate && <TimestampRow label="Created" value={formattedDate} />}
      {publishedAt && <TimestampRow label="Published" value={formatHistoryDateTime(publishedAt)} />}
      {unpublishedAt && <TimestampRow label="Unpublished" value={formatHistoryDateTime(unpublishedAt)} />}
    </>
  )
}

export function VersionInfoCard({ title, date, description, publishedAt, unpublishedAt }: VersionInfoCardProps) {
  if (!title && !date && !description) return null

  const formattedDate = date ? formatHistoryDateTime(date) : null
  const displayTitle = title ?? formattedDate

  const formattedDescription = description ? formatSourceInfo(description) : null
  const lines = formattedDescription?.includes('\n') ? formattedDescription.split('\n') : null
  const sourceInfo = lines ? lines[0] : null
  const userDescription = lines ? lines.slice(1).join('\n') : formattedDescription

  const showCreatedDate = title ? formattedDate : null
  const hasBody = showCreatedDate || publishedAt || unpublishedAt || sourceInfo || userDescription

  return (
    <Card isCompact className={styles.card}>
      {displayTitle && <TruncatedTitle text={displayTitle} />}
      {hasBody && (
        <CardBody>
          <Stack hasGutter>
            {sourceInfo && (
              <StackItem>
                <TruncatedText text={sourceInfo} variant="small" className={styles.sourceInfo} />
              </StackItem>
            )}
            {userDescription && (
              <StackItem>
                <TruncatedText text={userDescription} variant="p" className={styles.description} />
              </StackItem>
            )}
            <TimestampItems formattedDate={showCreatedDate} publishedAt={publishedAt} unpublishedAt={unpublishedAt} />
          </Stack>
        </CardBody>
      )}
    </Card>
  )
}

function TruncatedTitle({ text }: Readonly<{ text: string }>) {
  const { ref, isTruncated, onMouseEnter } = useTruncationTooltip()
  const content = (
    <CardTitle ref={ref} className={styles.title} onMouseEnter={onMouseEnter}>
      {text}
    </CardTitle>
  )
  return isTruncated ? <Tooltip content={text}>{content}</Tooltip> : content
}
