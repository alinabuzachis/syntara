// Target (input) handle style - vertical line
export const targetHandleStyle: React.CSSProperties = {
  width: 2,
  height: 16,
  borderRadius: 0,
  background: 'rgba(255, 255, 255, 0.9)',
  borderWidth: 0,
  borderStyle: 'none',
  cursor: 'crosshair',
}

// Source (output) handle style - semicircle
// ReactFlow positions handles at the edge, and overflow: hidden on the node clips the inner half
export const sourceHandleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.9)',
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.3)',
  borderStyle: 'solid',
  cursor: 'crosshair',
}
