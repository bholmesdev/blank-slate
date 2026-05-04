import type { ListItem, PhrasingContent, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type {
  CustomElement,
  CustomText,
  HeadingElement,
  ListItemElement,
  SlateDocument,
} from './slate'

const emptyText: CustomText = { text: '' }
const markdownParser = unified().use(remarkParse)

export const initialMarkdown = `# Slate Markdown prototype

Start writing here. Use **bold**, *italic*, <u>underline</u>, and \`inline code\`.

Type #, ##, or ### followed by Space at the start of a block to create headings.

- Type - or * followed by Space to start a bulleted list.`

export function deserializeMarkdown(markdown: string): SlateDocument {
  const tree = markdownParser.parse(markdown)
  const blocks = tree.children.map(deserializeBlock)
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', children: [{ ...emptyText }] }]
}

export function serializeMarkdown(value: SlateDocument): string {
  return value
    .map((node) => {
      if (node.type === 'bulleted-list') {
        return node.children
          .map((item) => `- ${item.children.map(serializeText).join('')}`)
          .join('\n')
      }

      const text = node.children.map(serializeText).join('')

      if (node.type === 'heading-one') return `# ${text}`
      if (node.type === 'heading-two') return `## ${text}`
      if (node.type === 'heading-three') return `### ${text}`
      return escapeParagraphStart(text)
    })
    .join('\n\n')
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

function deserializeBlock(node: RootContent): CustomElement {
  if (node.type === 'heading' && node.depth <= 3) {
    return {
      type: headingTypeForDepth(node.depth),
      children: deserializeInlineNodes(node.children),
    }
  }

  if (node.type === 'paragraph') {
    return {
      type: 'paragraph',
      children: deserializeInlineNodes(node.children),
    }
  }

  if (node.type === 'list' && !node.ordered) {
    return {
      type: 'bulleted-list',
      children: node.children.map(deserializeListItem),
    }
  }

  return {
    type: 'paragraph',
    children: [{ text: toString(node) }],
  }
}

function deserializeListItem(item: ListItem): ListItemElement {
  const [firstBlock] = item.children

  if (firstBlock?.type === 'paragraph') {
    return {
      type: 'list-item',
      children: deserializeInlineNodes(firstBlock.children),
    }
  }

  return {
    type: 'list-item',
    children: [{ text: firstBlock ? toString(firstBlock) : '' }],
  }
}

function deserializeInlineNodes(
  nodes: readonly PhrasingContent[],
  marks: Omit<CustomText, 'text'> = {},
) {
  const leaves: CustomText[] = []
  let underlineDepth = 0

  for (const node of nodes) {
    if (node.type === 'html' && isUnderlineOpenTag(node.value)) {
      underlineDepth += 1
      continue
    }

    if (node.type === 'html' && isUnderlineCloseTag(node.value)) {
      underlineDepth = Math.max(0, underlineDepth - 1)
      continue
    }

    leaves.push(
      ...deserializeInlineNode(node, {
        ...marks,
        ...(underlineDepth > 0 ? { underline: true } : {}),
      }),
    )
  }

  return mergeAdjacentLeaves(leaves.length > 0 ? leaves : [{ ...emptyText }])
}

function deserializeInlineNode(
  node: PhrasingContent,
  marks: Omit<CustomText, 'text'>,
): CustomText[] {
  if (node.type === 'text') return [{ text: node.value, ...marks }]
  if (node.type === 'inlineCode') return [{ text: node.value, ...marks, code: true }]
  if (node.type === 'break') return [{ text: '\n', ...marks }]
  if (node.type === 'strong') {
    return deserializeInlineNodes(node.children, { ...marks, bold: true })
  }
  if (node.type === 'emphasis') {
    return deserializeInlineNodes(node.children, { ...marks, italic: true })
  }
  if (node.type === 'html') return [{ text: node.value, ...marks }]

  return [{ text: toString(node), ...marks }]
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

function headingTypeForDepth(depth: number): HeadingElement['type'] {
  if (depth === 1) return 'heading-one'
  if (depth === 2) return 'heading-two'
  return 'heading-three'
}

function escapeMarkdownText(text: string) {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('*', '\\*')
    .replaceAll('`', '\\`')
}

function escapeParagraphStart(text: string) {
  return text.replace(/^(#{1,3})(\s)/, '\\$1$2')
}

function isUnderlineOpenTag(value: string) {
  return /^<u\s*>$/i.test(value)
}

function isUnderlineCloseTag(value: string) {
  return /^<\/u>$/i.test(value)
}
