import { toPageTitle } from '../utils/toPageTitle'

type NxPageTitleProps = {
  /** Title segments, most-specific first. The app name is appended automatically. */
  segments: (string | null | undefined)[]
}

/**
 * Sets the browser page `<title>`. Segments are joined with " | " and the
 * app name is appended automatically. Null, undefined, and blank segments
 * are filtered out. Place as the first child of `<NxPage>`.
 */
/* c8 ignore next -- V8 block coverage creates a phantom branch on the function declaration */
export function NxPageTitle({ segments }: Readonly<NxPageTitleProps>) {
  return <title>{toPageTitle(segments)}</title>
}
