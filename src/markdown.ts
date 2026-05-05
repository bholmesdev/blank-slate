import type { List, ListItem, PhrasingContent, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type {
  CustomElement,
  CustomText,
  HeadingElement,
  ListElement,
  ListItemElement,
  ParagraphElement,
  SlateDocument,
} from './slate'

const emptyText: CustomText = { text: '' }
const markdownParser = unified().use(remarkParse)

export const initialMarkdown = `# Slate Markdown prototype

Start writing here. Use **bold**, *italic*, <u>underline</u>, and \`inline code\`.

Type #, ##, or ### followed by Space at the start of a block to create headings.

- Type - or * followed by Space to start a bulleted list.
- Type 1. followed by Space to start a numbered list.
- Type -[] or -[x] followed by Space to start a task list.`

export function deserializeMarkdown(markdown: string): SlateDocument {
  const tree = markdownParser.parse(markdown)
  const blocks = tree.children.map(deserializeBlock)
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', children: [{ ...emptyText }] }]
}

export function serializeMarkdown(value: SlateDocument): string {
  return value
    .map((node) => {
      if (isListElement(node)) {
        return serializeList(node)
      }

      if (node.type === 'heading-one') return `# ${node.children.map(serializeText).join('')}`
      if (node.type === 'heading-two') return `## ${node.children.map(serializeText).join('')}`
      if (node.type === 'heading-three') return `### ${node.children.map(serializeText).join('')}`
      if (node.type === 'paragraph') {
        return escapeParagraphStart(node.children.map(serializeText).join(''))
      }
      return ''
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

  if (node.type === 'list') {
    return {
      type: listTypeForMarkdownList(node),
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
  const taskState = taskStateForListItem(item)
  const paragraphChildren =
    firstBlock?.type === 'paragraph'
      ? stripTaskMarker(deserializeInlineNodes(firstBlock.children), taskState !== null)
      : [{ text: firstBlock ? toString(firstBlock) : '' }]
  const children: ListItemElement['children'] = [
    {
      type: 'paragraph',
      children: paragraphChildren,
    },
  ]

  for (const block of item.children.slice(1)) {
    if (block.type === 'list') {
      children.push({
        type: listTypeForMarkdownList(block),
        children: block.children.map(deserializeListItem),
      })
    }
  }

  return {
    type: 'list-item',
    checked: taskState ?? undefined,
    children,
  }
}

function serializeList(list: ListElement, depth = 0): string {
  const indent = '  '.repeat(depth)

  return list.children
    .map((item, index) => {
      const text = itemParagraph(item).children.map(serializeText).join('')
      const nestedText = nestedLists(item.children)
        .map((list) => serializeList(list, depth + 1))
        .join('\n')
      const marker = listMarker(list.type, item, index)

      return [`${indent}${marker} ${text}`, nestedText].filter(Boolean).join('\n')
    })
    .join('\n')
}

function itemParagraph(item: ListItemElement) {
  return item.children.find(
    (child): child is ParagraphElement => child.type === 'paragraph',
  ) ?? { type: 'paragraph', children: [{ ...emptyText }] }
}

function nestedLists(children: ListItemElement['children']) {
  return children.filter(isListElement)
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
  return text
    .replace(/^(#{1,3})(\s)/, '\\$1$2')
    .replace(/^((?:[-*])|\d+\.)(\s)/, '\\$1$2')
    .replace(/^(-\[(?: |x|X)?\])(\s)/, '\\$1$2')
}

function isUnderlineOpenTag(value: string) {
  return /^<u\s*>$/i.test(value)
}

function isUnderlineCloseTag(value: string) {
  return /^<\/u>$/i.test(value)
}

function listTypeForMarkdownList(node: List): ListElement['type'] {
  if (node.ordered) return 'numbered-list'
  if (node.children.some((item) => taskStateForListItem(item) !== null)) return 'task-list'
  return 'bulleted-list'
}

function listMarker(type: ListElement['type'], item: ListItemElement, index: number) {
  if (type === 'numbered-list') return `${index + 1}.`
  if (type === 'task-list') return `- [${item.checked ? 'x' : ' '}]`
  return '-'
}

function isListElement(node: CustomElement): node is ListElement
function isListElement(node: ListItemElement['children'][number]): node is ListElement
function isListElement(node: CustomElement | ListItemElement['children'][number]): node is ListElement {
  return (
    node.type === 'bulleted-list' ||
    node.type === 'numbered-list' ||
    node.type === 'task-list'
  )
}

function taskStateForListItem(item: ListItem) {
  if (typeof item.checked === 'boolean') return item.checked

  const [firstBlock] = item.children
  if (firstBlock?.type !== 'paragraph') return null

  const text = toString(firstBlock)
  const match = text.match(/^\[( |x|X)?\]\s+/)
  if (!match) return null
  return match[1]?.toLowerCase() === 'x'
}

function stripTaskMarker(children: CustomText[], shouldStrip: boolean) {
  if (!shouldStrip) return children

  const [first, ...rest] = children
  if (!first) return [{ ...emptyText }]

  return [{ ...first, text: first.text.replace(/^\[(?: |x|X)?\]\s+/, '') }, ...rest]
}
