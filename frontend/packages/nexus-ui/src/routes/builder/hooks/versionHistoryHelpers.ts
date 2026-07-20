type VersionNameSource = {
  status?: string | null
  name?: string | null
  version: number
}

/** Toggle which version kebab is open; clicking the open one closes it. */
export function nextOpenKebabVersionId(current: string | null, versionId: string): string | null {
  if (current === versionId) {
    return null
  }
  return versionId
}

/** Close PatternFly dropdown only when it reports closed. */
export function closeWhenDropdownCloses(open: boolean, onClose: () => void): void {
  if (!open) {
    onClose()
  }
}

/** Display name for the currently published version, if any. */
export function resolvePublishedVersionName(versions: VersionNameSource[] | undefined): string | null {
  const pub = versions?.find((v) => v.status === 'published')
  if (!pub) {
    return null
  }
  return pub.name ?? `Version ${pub.version}`
}
