/** One segment of the page breadcrumb trail. The last item must omit `href` (current page). */
export type AppBreadcrumbItem = {
  readonly label: string
  readonly href?: string
}
