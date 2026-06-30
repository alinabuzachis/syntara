/** Minimum supported viewport for React Flow canvases: 720p (1280 × 720 pixels). */
export const MIN_SUPPORTED_VIEWPORT = {
  width: 1280,
  height: 720,
} as const

export const REACT_FLOW_VIEWPORT_EMPTY_STATE = {
  title: 'A larger screen is needed',
  body: 'The workflow canvas is optimized for larger screens and cannot be displayed at this size. Resize your browser window or switch to a device with a wider display.',
  returnLabel: 'Return to Workflows',
} as const
