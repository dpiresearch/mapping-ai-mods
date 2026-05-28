import { describe, expect, it } from 'vitest'
import { parseShowQuery } from './voiceShowQuery'

describe('parseShowQuery', () => {
  it('parses anchor connections with entity type constraint', () => {
    expect(parseShowQuery('all OpenAI connections that are organization')).toEqual({
      type: 'connections',
      anchorName: 'OpenAI',
      entityTypes: ['organization'],
      categoryHint: undefined,
      includeAnchor: true,
    })
  })

  it('parses entity type before connected to anchor', () => {
    expect(parseShowQuery('organizations connected to OpenAI')).toEqual({
      type: 'connections',
      anchorName: 'OpenAI',
      entityTypes: ['organization'],
      includeAnchor: true,
    })
  })

  it('parses simple connections phrase', () => {
    expect(parseShowQuery('OpenAI connections')).toEqual({
      type: 'connections',
      anchorName: 'OpenAI',
      includeAnchor: true,
    })
  })

  it('uses find for short entity names', () => {
    expect(parseShowQuery('OpenAI')).toEqual({ type: 'find', name: 'OpenAI' })
  })

  it('falls back to text for long unstructured queries', () => {
    const spec = parseShowQuery('researchers working on alignment policy in washington')
    expect(spec.type).toBe('text')
    if (spec.type === 'text') {
      expect(spec.query).toContain('alignment')
    }
  })
})
