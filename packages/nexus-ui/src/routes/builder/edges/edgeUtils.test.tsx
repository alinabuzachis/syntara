import { Position } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { adjustEdgeCoordinates, adjustSourceCoordinates, SOURCE_EDGE_OFFSET } from './edgeUtils'

describe('SOURCE_EDGE_OFFSET', () => {
  it('should be 5', () => {
    expect(SOURCE_EDGE_OFFSET).toBe(5)
  })
})

describe('adjustSourceCoordinates', () => {
  it('adjusts coordinates for Position.Right', () => {
    const result = adjustSourceCoordinates(100, 50, Position.Right)
    expect(result.x).toBe(95) // 100 - 5
    expect(result.y).toBe(50) // unchanged
  })

  it('adjusts coordinates for Position.Left', () => {
    const result = adjustSourceCoordinates(100, 50, Position.Left)
    expect(result.x).toBe(105) // 100 + 5
    expect(result.y).toBe(50) // unchanged
  })

  it('adjusts coordinates for Position.Bottom', () => {
    const result = adjustSourceCoordinates(100, 50, Position.Bottom)
    expect(result.x).toBe(100) // unchanged
    expect(result.y).toBe(45) // 50 - 5
  })

  it('adjusts coordinates for Position.Top', () => {
    const result = adjustSourceCoordinates(100, 50, Position.Top)
    expect(result.x).toBe(100) // unchanged
    expect(result.y).toBe(55) // 50 + 5
  })

  it('uses custom offset', () => {
    const result = adjustSourceCoordinates(100, 50, Position.Right, 10)
    expect(result.x).toBe(90) // 100 - 10
  })
})

describe('adjustEdgeCoordinates', () => {
  it('adjusts source coordinates and keeps target unchanged', () => {
    const result = adjustEdgeCoordinates({
      sourceX: 100,
      sourceY: 50,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 150,
    })
    expect(result.sourceX).toBe(95) // adjusted
    expect(result.sourceY).toBe(50) // unchanged
    expect(result.targetX).toBe(200) // unchanged
    expect(result.targetY).toBe(150) // unchanged
  })

  it('uses custom offset', () => {
    const result = adjustEdgeCoordinates({
      sourceX: 100,
      sourceY: 50,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 150,
      offset: 10,
    })
    expect(result.sourceX).toBe(90) // 100 - 10
  })
})
