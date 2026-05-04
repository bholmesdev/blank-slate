import type { CustomText, SlateDocument } from './slate'

const emptyText: CustomText = { text: '' }

export const initialMarkdown = `# Slate Markdown prototype

Start writing here. Use **bold**, *italic*, <u>underline</u>, and \`inline code\`.

Type #, ##, or ### followed by Space at the start of a block to create headings.`

export function deserializeMarkdown(markdown: string): SlateDocument {
  const blocks = markdown.trim().length > 0 ? markdown.split(/\n{2,}/) : ['']

  return blocks.map((block) => {
    const lines = block.split('\n')
    const firstLine = lines[0] ?? ''
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(firstLine)

    if (headingMatch) {
      return {
        type: headingTypeForDepth(headingMatch[1].length),
        children: parseInline(headingMatch[2]),
      }
    }

    return {
      type: 'paragraph',
      children: parseInline(lines.join('\n')),
    }
  })
}

export function serializeMarkdown(value: SlateDocument): string {
  return value
    .map((node) => {
      const text = node.children.map(serializeText).join('')

      if (node.type === 'heading-one') return `# ${text}`
      if (node.type === 'heading-two') return `## ${text}`
      if (node.type === 'heading-three') return `### ${text}`
      return text
    })
    .join('\n\n')
}

function parseInline(input: string): CustomText[] {
  if (input.length === 0) return [{ ...emptyText }]

  const leaves: CustomText[] = []
  let index = 0

  while (index < input.length) {
    const code = takeDelimited(input, index, '`', '`')
    if (code) {
      leaves.push({ text: code.content, code: true })
      index = code.nextIndex
      continue
    }

    const underline = takeDelimited(input, index, '<u>', '</u>')
    if (underline) {
      appendMarked(leaves, parseInline(underline.content), { underline: true })
      index = underline.nextIndex
      continue
    }

    const bold = takeDelimited(input, index, '**', '**')
    if (bold) {
      appendMarked(leaves, parseInline(bold.content), { bold: true })
      index = bold.nextIndex
      continue
    }

    const italic = takeDelimited(input, index, '*', '*')
    if (italic) {
      appendMarked(leaves, parseInline(italic.content), { italic: true })
      index = italic.nextIndex
      continue
    }

    const nextIndex = findNextDelimiter(input, index + 1)
    leaves.push({ text: input.slice(index, nextIndex) })
    index = nextIndex
  }

  return mergeAdjacentLeaves(leaves)
}

function serializeText(leaf: CustomText): string {
  let text = escapeMarkdownText(leaf.text)

  if (leaf.code) {
    return `\`${leaf.text.replaceAll('`', '\\`')}\``
  }

  if (leaf.underline) text = `<u>${text}</u>`
  if (leaf.italic) text = `*${text}*`
  if (leaf.bold) text = `**${text}**`
  return text
}

function takeDelimited(
  input: string,
  index: number,
  start: string,
  end: string,
) {
  if (!input.startsWith(start, index)) return null

  const contentStart = index + start.length
  const contentEnd = input.indexOf(end, contentStart)
  if (contentEnd === -1) return null

  return {
    content: input.slice(contentStart, contentEnd),
    nextIndex: contentEnd + end.length,
  }
}

function appendMarked(
  target: CustomText[],
  leaves: CustomText[],
  mark: Omit<CustomText, 'text'>,
) {
  for (const leaf of leaves) {
    target.push({ ...leaf, ...mark })
  }
}

function mergeAdjacentLeaves(leaves: CustomText[]) {
  return leaves.reduce<CustomText[]>((merged, leaf) => {
    const previous = merged.at(-1)
    if (previous && sameMarks(previous, leaf)) {
      previous.text += leaf.text
      return merged
    }
    merged.push({ ...leaf })
    return merged
  }, [])
}

function sameMarks(a: CustomText, b: CustomText) {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.code === !!b.code
  )
}

function findNextDelimiter(input: string, from: number) {
  const delimiters = ['`', '**', '*', '<u>']
  const next = delimiters
    .map((delimiter) => input.indexOf(delimiter, from))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0]

  return next ?? input.length
}

function headingTypeForDepth(depth: number) {
  if (depth === 1) return 'heading-one'
  if (depth === 2) return 'heading-two'
  return 'heading-three'
}

function escapeMarkdownText(text: string) {
  return text.replaceAll('\\', '\\\\').replaceAll('*', '\\*')
}
