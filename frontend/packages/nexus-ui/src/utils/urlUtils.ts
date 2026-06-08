/**
 * Remove all trailing slashes from a URL string.
 *
 * @example
 * trimTrailingSlashes('https://example.com/')   // 'https://example.com'
 * trimTrailingSlashes('https://example.com///') // 'https://example.com'
 * trimTrailingSlashes('')                        // ''
 */
export function trimTrailingSlashes(url: string): string {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end--
  return url.slice(0, end)
}
