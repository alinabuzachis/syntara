import { Card, CardBody, CardTitle, Content, ContentVariants, Stack, StackItem, Tooltip } from '@patternfly/react-core'
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

export function VersionInfoCard({ title, date, description }: VersionInfoCardProps) {
  if (!title && !date && !description) return null

  const formattedDate = date ? formatHistoryDateTime(date) : null
  const displayTitle = title ?? formattedDate
  const displayDate = title ? formattedDate : null

  const formattedDescription = description ? formatSourceInfo(description) : null
  const lines = formattedDescription?.includes('\n') ? formattedDescription.split('\n') : null
  const sourceInfo = lines ? lines[0] : null
  const userDescription = lines ? lines.slice(1).join('\n') : formattedDescription

  return (
    <Card isCompact className={styles.card}>
      {displayTitle && <TruncatedTitle text={displayTitle} />}
      {displayDate && (
        <CardBody>
          <Content component={ContentVariants.small}>{displayDate}</Content>
        </CardBody>
      )}
      {(sourceInfo ?? userDescription) && (
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
