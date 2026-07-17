/** Minimum supported viewport width for React Flow canvases (1024px). Height is unconstrained. */
export const MIN_SUPPORTED_VIEWPORT = {
  width: 1024,
} as const

export const REACT_FLOW_VIEWPORT_EMPTY_STATE = {
  title: 'A larger screen is needed',
  body: 'The workflow canvas is optimized for larger screens and cannot be displayed at this size. Resize your browser window or switch to a device with a wider display.',
  returnLabel: 'Return to Workflows',
} as const
