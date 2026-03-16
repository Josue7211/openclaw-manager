import React from 'react'

export function MarkdownText({ text }: { text: string }) {
  const codeStyle: React.CSSProperties = {
    background: 'var(--purple-a15)',
    padding: '1px 5px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '12px',
  }
  const ulStyle: React.CSSProperties = { margin: '6px 0 6px 16px', padding: 0 }

  function parseInline(line: string, keyPrefix: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = []
    const pattern = /\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|_(.+?)_/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let i = 0

    while ((match = pattern.exec(line)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(line.slice(lastIndex, match.index))
      }

      if (match[1] != null) {
        nodes.push(<strong key={`${keyPrefix}-${i}`}>{match[1]}</strong>)
      } else if (match[2] != null) {
        nodes.push(<code key={`${keyPrefix}-${i}`} style={codeStyle}>{match[2]}</code>)
      } else if (match[3] != null) {
        nodes.push(<em key={`${keyPrefix}-${i}`}>{match[3]}</em>)
      } else if (match[4] != null) {
        nodes.push(<em key={`${keyPrefix}-${i}`}>{match[4]}</em>)
      }

      lastIndex = pattern.lastIndex
      i++
    }

    if (lastIndex < line.length) {
      nodes.push(line.slice(lastIndex))
    }

    return nodes
  }

  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listKey = 0

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${listKey}`} style={ulStyle}>{listItems}</ul>)
      listItems = []
      listKey++
    }
  }

  lines.forEach((line, idx) => {
    const bulletMatch = line.match(/^- (.+)$/)
    if (bulletMatch) {
      listItems.push(<li key={`li-${idx}`}>{parseInline(bulletMatch[1], `li-${idx}`)}</li>)
    } else {
      flushList()
      if (idx > 0) elements.push(<br key={`br-${idx}`} />)
      elements.push(<React.Fragment key={`ln-${idx}`}>{parseInline(line, `ln-${idx}`)}</React.Fragment>)
    }
  })

  flushList()

  return <>{elements}</>
}
