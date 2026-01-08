/**
 * Shared marker definitions for edge states (selected, hover, default).
 * These markers are rendered in each edge component's defs section.
 */
export function EdgeMarkers() {
  return (
    <defs>
      <marker
        id="selected-arrow-marker"
        markerWidth="12"
        markerHeight="12"
        viewBox="-10 -10 20 20"
        orient="auto"
        refX="-5"
        refY="0"
      >
        <polyline
          stroke="#e5e7eb"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
          fill="#e5e7eb"
          points="-5,-4 0,0 -5,4 -5,-4"
        />
      </marker>
      <marker
        id="hover-arrow-marker"
        markerWidth="12"
        markerHeight="12"
        viewBox="-10 -10 20 20"
        orient="auto"
        refX="-5"
        refY="0"
      >
        <polyline
          stroke="#e5e7eb"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
          fill="#e5e7eb"
          points="-5,-4 0,0 -5,4 -5,-4"
        />
      </marker>
    </defs>
  )
}
