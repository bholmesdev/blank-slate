import { Editor, Element, Node, Path, Range, Transforms } from 'slate'
import type { KeyboardEvent } from 'react'
import { ReactEditor } from 'slate-react'
import type {
  BlockType,
  BulletedListElement,
  CustomEditor,
  CustomElement,
  CustomText,
  ListItemElement,
  ParagraphElement,
} from './slate'

export type MarkType = Exclude<keyof CustomText, 'text'>

const inlineMarks: MarkType[] = ['bold', 'italic', 'underline', 'code']

export function isMarkActive(editor: CustomEditor, mark: MarkType) {
  const marks = Editor.marks(editor)
  return marks ? marks[mark] === true : false
}

export function toggleMark(editor: CustomEditor, mark: MarkType) {
  if (isMarkActive(editor, mark)) {
    Editor.removeMark(editor, mark)
    return
  }

  Editor.addMark(editor, mark, true)
}

export function isBlockActive(editor: CustomEditor, blockType: BlockType) {
  const [match] = Editor.nodes(editor, {
    match: (node) => Element.isElement(node) && node.type === blockType,
  })

  return !!match
}

export function setBlockType(editor: CustomEditor, blockType: BlockType) {
  if (blockType === 'bulleted-list') {
    toggleBulletedList(editor)
    return
  }

  if (currentListItem(editor)) {
    liftListItemToParagraph(editor)
  }

  Transforms.setNodes(
    editor,
    { type: blockType },
    { match: (node) => isTextBlock(editor, node) },
  )
}

export function toggleBlock(editor: CustomEditor, blockType: BlockType) {
  setBlockType(editor, isBlockActive(editor, blockType) ? 'paragraph' : blockType)
}

export function handleMarkdownShortcut(editor: CustomEditor, event: KeyboardEvent) {
  if (event.key !== ' ' || !editor.selection || !Range.isCollapsed(editor.selection)) {
    return false
  }

  const anchor = editor.selection.anchor
  const blockEntry = Editor.above(editor, {
    match: (node) => Element.isElement(node) && Editor.isBlock(editor, node),
  })

  if (!blockEntry) return false

  const [, blockPath] = blockEntry
  const blockStart = Editor.start(editor, blockPath)
  const beforeRange = Editor.range(editor, blockStart, anchor)
  const beforeText = Editor.string(editor, beforeRange)
  const blockType = blockTypeFromMarkdownToken(beforeText)

  if (!blockType) return false

  event.preventDefault()
  Transforms.select(editor, beforeRange)
  Transforms.delete(editor)
  setBlockType(editor, blockType)
  return true
}

export function handleReturnInEmptyHeading(editor: CustomEditor, event: KeyboardEvent) {
  if (event.key !== 'Enter' || !editor.selection || !Range.isCollapsed(editor.selection)) {
    return false
  }

  const [match] = Editor.nodes(editor, {
    match: (node) =>
      Element.isElement(node) &&
      node.type !== 'paragraph' &&
      Node.string(node).length === 0,
  })

  if (!match) return false

  event.preventDefault()
  setBlockType(editor, 'paragraph')
  return true
}

export function handleListKeyDown(editor: CustomEditor, event: KeyboardEvent) {
  const selection = syncDomSelection(editor)
  if (!selection || !Range.isCollapsed(selection)) return false

  const listItemEntry = currentListItemFromDom(editor) ?? currentListItem(editor)
  if (!listItemEntry) return false

  const [, listItemPath] = listItemEntry
  const itemStart = Editor.start(editor, listItemPath)
  const isAtStart = Range.equals(selection, Editor.range(editor, itemStart))

  if (event.key === 'Tab' && event.shiftKey) {
    if (!isNestedListItem(editor, listItemPath)) return false

    event.preventDefault()
    liftListItem(editor, listItemPath, selection.anchor.offset)
    return true
  }

  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    return indentListItem(editor, listItemPath)
  }

  const shouldExitParent =
    isDeleteKey(event.key) &&
    isAtStart &&
    !isNestedListItem(editor, listItemPath) &&
    hasChildList(editor, listItemPath)

  if (shouldExitParent) {
    event.preventDefault()
    exitParentItemToParagraph(editor, listItemPath)
    return true
  }

  if (event.key === 'Enter' && isListItemTextEmpty(editor, listItemPath)) {
    event.preventDefault()
    liftListItem(editor, listItemPath, selection.anchor.offset)
    return true
  }

  if (isDeleteKey(event.key) && isAtStart) {
    event.preventDefault()
    liftListItem(editor, listItemPath, selection.anchor.offset)
    return true
  }

  if (event.key !== 'Enter') return false

  const paragraphPath = itemParagraphPath(editor, listItemPath)
  if (!paragraphPath) return false

  event.preventDefault()
  splitListItem(editor, listItemPath, selection.anchor.offset)
  return true
}

export function activeMarks(editor: CustomEditor) {
  return inlineMarks.filter((mark) => isMarkActive(editor, mark))
}

function blockTypeFromMarkdownToken(token: string): BlockType | null {
  if (token === '#') return 'heading-one'
  if (token === '##') return 'heading-two'
  if (token === '###') return 'heading-three'
  if (token === '-' || token === '*') return 'bulleted-list'
  return null
}

function isDeleteKey(key: string) {
  return key === 'Delete' || key === 'Backspace'
}

function syncDomSelection(editor: CustomEditor) {
  const domSelection = window.getSelection()
  if (!domSelection || domSelection.rangeCount === 0) return editor.selection

  const slateRange = ReactEditor.toSlateRange(editor, domSelection, {
    exactMatch: false,
    suppressThrow: true,
  })

  if (slateRange) {
    Transforms.select(editor, slateRange)
  }

  return slateRange ?? editor.selection
}

function toggleBulletedList(editor: CustomEditor) {
  if (isBlockActive(editor, 'bulleted-list')) {
    const listItemEntry = currentListItem(editor)
    if (listItemEntry) {
      liftListItem(editor, listItemEntry[1])
    }
    return
  }

  Transforms.setNodes(
    editor,
    { type: 'paragraph' } as Partial<CustomElement>,
    { match: (node) => isTextBlock(editor, node) },
  )
  Transforms.wrapNodes(editor, { type: 'list-item', children: [] })
  Transforms.wrapNodes(
    editor,
    bulletedList([]),
    { match: isListItemElement },
  )
}

function liftListItem(editor: CustomEditor, itemPath: Path, offset = 0) {
  const listPath = Path.parent(itemPath)

  if (isNestedListItem(editor, itemPath)) {
    const item = Node.get(editor, itemPath)
    if (!Element.isElement(item) || item.type !== 'list-item') return

    const itemIndex = itemPath.at(-1)
    if (itemIndex === undefined) return

    const parentItemPath = Path.parent(listPath)
    const liftedItem = structuredClone(item) as ListItemElement
    const list = Node.get(editor, listPath)
    if (!Element.isElement(list) || list.type !== 'bulleted-list') return

    const followingItems = list.children.slice(itemIndex + 1).map(cloneListItem)
    appendNestedItems(liftedItem, followingItems)

    const nextItemPath = Path.next(parentItemPath)

    Editor.withoutNormalizing(editor, () => {
      for (let index = list.children.length - 1; index >= itemIndex; index -= 1) {
        Transforms.removeNodes(editor, { at: listPath.concat(index) })
      }
      removeListIfEmpty(editor, listPath)
      Transforms.insertNodes(editor, liftedItem, { at: nextItemPath })
      selectListItemText(editor, nextItemPath, offset)
    })
    return
  }

  liftListItemToParagraph(editor)
}

function liftListItemToParagraph(editor: CustomEditor) {
  Transforms.unwrapNodes(editor, {
    match: (node) => Element.isElement(node) && node.type === 'bulleted-list',
    split: true,
  })
  Transforms.unwrapNodes(editor, { match: isListItemElement, split: true })
}

function splitListItem(editor: CustomEditor, itemPath: Path, offset: number) {
  const item = Node.get(editor, itemPath)
  if (!Element.isElement(item) || item.type !== 'list-item') return

  const paragraphPath = itemParagraphPath(editor, itemPath)
  if (!paragraphPath) return

  const paragraph = Node.get(editor, paragraphPath)
  if (!Element.isElement(paragraph) || paragraph.type !== 'paragraph') return

  const [before, after] = splitLeaves(paragraph.children, offset)
  const childIndexes = offset === 0 ? childListIndexes(item) : []
  const nextItem = emptyListItem(after)
  nextItem.children.push(
    ...childIndexes.map((index) => structuredClone(item.children[index] as BulletedListElement)),
  )
  const nextItemPath = Path.next(itemPath)

  Editor.withoutNormalizing(editor, () => {
    if (offset === 0) {
      for (const index of [...childIndexes].reverse()) {
        Transforms.removeNodes(editor, { at: itemPath.concat(index) })
      }
    }
    Transforms.removeNodes(editor, { at: paragraphPath })
    Transforms.insertNodes(editor, emptyParagraph(before), { at: paragraphPath })
    Transforms.insertNodes(editor, nextItem, { at: nextItemPath })
    selectListItemText(editor, nextItemPath, 0)
  })
}

function exitParentItemToParagraph(editor: CustomEditor, itemPath: Path) {
  const item = Node.get(editor, itemPath)
  if (!Element.isElement(item) || item.type !== 'list-item') return

  const itemIndex = itemPath.at(-1)
  if (itemIndex === undefined) return

  const listPath = Path.parent(itemPath)
  const list = Node.get(editor, listPath)
  if (!Element.isElement(list) || list.type !== 'bulleted-list') return

  const paragraph = item.children.find(isParagraphElement)
  if (!paragraph) return

  const promotedItems = item.children
    .filter(isBulletedListElement)
    .flatMap((list) => list.children.map(cloneListItem))
  const previousItems = list.children.slice(0, itemIndex).map(cloneListItem)
  const nextItems = list.children.slice(itemIndex + 1).map(cloneListItem)
  const replacementNodes: CustomElement[] = [
    ...(previousItems.length > 0 ? [bulletedList(previousItems)] : []),
    structuredClone(paragraph),
    ...(promotedItems.length > 0 ? [bulletedList(promotedItems)] : []),
    ...(nextItems.length > 0 ? [bulletedList(nextItems)] : []),
  ]

  const paragraphPath = previousItems.length > 0 ? Path.next(listPath) : listPath

  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: listPath })
    Transforms.insertNodes(editor, replacementNodes, { at: listPath })
    Transforms.select(editor, Editor.start(editor, paragraphPath))
  })
}

function indentListItem(editor: CustomEditor, itemPath: Path) {
  if (itemPath.at(-1) === 0) return false

  let indented = false

  Editor.withoutNormalizing(editor, () => {
    const previousItemPath = Path.previous(itemPath)
    const previousItem = Node.get(editor, previousItemPath)
    if (!Element.isElement(previousItem) || previousItem.type !== 'list-item') {
      return
    }

    const nestedListPath = getOrCreateNestedList(editor, previousItemPath)
    const nestedList = Node.get(editor, nestedListPath)
    if (!Element.isElement(nestedList) || nestedList.type !== 'bulleted-list') {
      return
    }

    Transforms.moveNodes(editor, {
      at: itemPath,
      to: nestedListPath.concat(nestedList.children.length),
    })
    indented = true
  })

  return indented
}

function getOrCreateNestedList(editor: CustomEditor, itemPath: Path) {
  const item = Node.get(editor, itemPath)
  if (!Element.isElement(item) || item.type !== 'list-item') {
    throw new Error('Expected list item')
  }

  const existingIndex = item.children.findIndex(
    (child) => Element.isElement(child) && child.type === 'bulleted-list',
  )

  if (existingIndex !== -1) return itemPath.concat(existingIndex)

  const nestedListPath = itemPath.concat(item.children.length)
  Transforms.insertNodes(editor, bulletedList([]), { at: nestedListPath })
  return nestedListPath
}

function removeListIfEmpty(editor: CustomEditor, listPath: Path) {
  const list = Node.get(editor, listPath)
  if (Element.isElement(list) && list.type === 'bulleted-list' && list.children.length === 0) {
    Transforms.removeNodes(editor, { at: listPath })
  }
}

function hasChildList(editor: CustomEditor, itemPath: Path) {
  const item = Node.get(editor, itemPath)
  return Element.isElement(item) && item.type === 'list-item' && item.children.some(isBulletedListElement)
}

function itemParagraphPath(editor: CustomEditor, itemPath: Path) {
  const item = Node.get(editor, itemPath)
  if (!Element.isElement(item) || item.type !== 'list-item') return null

  const index = item.children.findIndex(
    (child) => Element.isElement(child) && child.type === 'paragraph',
  )

  return index === -1 ? null : itemPath.concat(index)
}

function selectListItemText(editor: CustomEditor, itemPath: Path, offset: number) {
  const paragraphPath = itemParagraphPath(editor, itemPath)
  if (!paragraphPath) return

  const textPath = paragraphPath.concat(0)
  if (!Node.has(editor, textPath)) return

  const text = Node.get(editor, textPath)
  const end = 'text' in text ? text.text.length : 0
  const point = { path: textPath, offset: Math.min(offset, end) }
  Transforms.select(editor, { anchor: point, focus: point })
}

function emptyParagraph(children: CustomText[] = [{ text: '' }]) {
  return { type: 'paragraph', children } satisfies CustomElement
}

function emptyListItem(children?: CustomText[]): ListItemElement {
  return { type: 'list-item', children: [emptyParagraph(children)] }
}

function bulletedList(children: ListItemElement[]): BulletedListElement {
  return { type: 'bulleted-list', children }
}

function appendNestedItems(item: ListItemElement, nestedItems: ListItemElement[]) {
  if (nestedItems.length === 0) return

  const nestedList = item.children.find(isBulletedListElement)
  if (nestedList) {
    nestedList.children.push(...nestedItems)
    return
  }

  item.children.push(bulletedList(nestedItems))
}

function cloneListItem(item: ListItemElement): ListItemElement {
  return structuredClone(item)
}

function currentListItemFromDom(editor: CustomEditor) {
  const domSelection = window.getSelection()
  const anchor = domSelection?.anchorNode
  const element = anchor instanceof HTMLElement ? anchor : anchor?.parentElement
  const slateElement = element?.closest('p[data-slate-node="element"]')
  if (!(slateElement instanceof HTMLElement)) return null

  const slateNode = ReactEditor.toSlateNode(editor, slateElement)
  const path = ReactEditor.findPath(editor, slateNode)
  const entry = Editor.above(editor, { at: path, match: isListItemElement })

  if (!entry || !Element.isElement(entry[0]) || entry[0].type !== 'list-item') {
    return null
  }

  return entry
}

function currentListItem(editor: CustomEditor) {
  const entry = Editor.above(editor, { match: isListItemElement })
  if (!entry || !Element.isElement(entry[0]) || entry[0].type !== 'list-item') {
    return null
  }

  return entry
}

function isTextBlock(editor: CustomEditor, node: Node) {
  return (
    Element.isElement(node) &&
    Editor.isBlock(editor, node) &&
    node.type !== 'bulleted-list' &&
    node.type !== 'list-item'
  )
}

function isListItemElement(node: Node) {
  return Element.isElement(node) && node.type === 'list-item'
}

function isBulletedListElement(node: Node): node is BulletedListElement {
  return Element.isElement(node) && node.type === 'bulleted-list'
}

function isParagraphElement(node: Node): node is ParagraphElement {
  return Element.isElement(node) && node.type === 'paragraph'
}

function childListIndexes(item: ListItemElement) {
  return item.children.reduce<number[]>((indexes, child, index) => {
    if (isBulletedListElement(child)) indexes.push(index)
    return indexes
  }, [])
}

function isListItemTextEmpty(editor: CustomEditor, itemPath: Path) {
  const paragraphPath = itemParagraphPath(editor, itemPath)
  if (!paragraphPath) return false

  return Node.string(Node.get(editor, paragraphPath)) === ''
}

function isNestedListItem(editor: CustomEditor, itemPath: Path) {
  const listPath = Path.parent(itemPath)
  const parentItemPath = Path.parent(listPath)
  const parentItem = Node.has(editor, parentItemPath)
    ? Node.get(editor, parentItemPath)
    : null

  return Element.isElement(parentItem) && parentItem.type === 'list-item'
}

function splitLeaves(leaves: CustomText[], offset: number) {
  const before: CustomText[] = []
  const after: CustomText[] = []
  let remaining = offset

  for (const leaf of leaves) {
    if (remaining >= leaf.text.length) {
      before.push({ ...leaf })
      remaining -= leaf.text.length
      continue
    }

    if (remaining <= 0) {
      after.push({ ...leaf })
      continue
    }

    before.push({ ...leaf, text: leaf.text.slice(0, remaining) })
    after.push({ ...leaf, text: leaf.text.slice(remaining) })
    remaining = 0
  }

  return [
    before.length > 0 ? before : [{ text: '' }],
    after.length > 0 ? after : [{ text: '' }],
  ] as const
}
