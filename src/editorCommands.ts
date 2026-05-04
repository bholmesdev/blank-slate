import { Editor, Element, Node, Range, Transforms } from 'slate'
import type { KeyboardEvent } from 'react'
import type { BlockType, CustomEditor, CustomElement, CustomText } from './slate'

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

  if (getCurrentListItem(editor)) {
    liftListItemToParagraph(editor)
  }

  Transforms.setNodes(
    editor,
    { type: blockType },
    { match: (node) => isEditableTextBlock(editor, node) },
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
  const listType = listTypeFromMarkdownToken(beforeText)

  if (listType) {
    event.preventDefault()
    Transforms.select(editor, beforeRange)
    Transforms.delete(editor)
    toggleBulletedList(editor)
    return true
  }

  const heading = headingTypeFromMarkdownToken(beforeText)

  if (!heading) return false

  event.preventDefault()
  Transforms.select(editor, beforeRange)
  Transforms.delete(editor)
  setBlockType(editor, heading)
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
  if (!editor.selection || !Range.isCollapsed(editor.selection)) return false

  const listItemEntry = getCurrentListItem(editor)
  if (!listItemEntry) return false

  const [, listItemPath] = listItemEntry
  const itemStart = Editor.start(editor, listItemPath)
  const isAtStart = Range.equals(editor.selection, Editor.range(editor, itemStart))

  if (isListLiftKey(event.key) && isAtStart) {
    event.preventDefault()
    liftListItemToParagraph(editor)
    return true
  }

  if (event.key !== 'Enter') return false

  const itemEnd = Editor.end(editor, listItemPath)
  if (!Range.equals(editor.selection, Editor.range(editor, itemEnd))) {
    return false
  }

  event.preventDefault()
  Transforms.splitNodes(editor, {
    always: true,
    match: (node) => Element.isElement(node) && node.type === 'list-item',
  })
  return true
}

export function activeMarks(editor: CustomEditor) {
  return inlineMarks.filter((mark) => isMarkActive(editor, mark))
}

function headingTypeFromMarkdownToken(token: string): BlockType | null {
  if (token === '#') return 'heading-one'
  if (token === '##') return 'heading-two'
  if (token === '###') return 'heading-three'
  return null
}

function listTypeFromMarkdownToken(token: string): BlockType | null {
  if (token === '-' || token === '*') return 'bulleted-list'
  return null
}

function isListLiftKey(key: string) {
  return key === 'Enter' || key === 'Delete' || key === 'Backspace'
}

function toggleBulletedList(editor: CustomEditor) {
  if (isBlockActive(editor, 'bulleted-list')) {
    liftListItemToParagraph(editor)
    return
  }

  Transforms.setNodes(
    editor,
    { type: 'list-item' } as Partial<CustomElement>,
    { match: (node) => isEditableTextBlock(editor, node) },
  )
  Transforms.wrapNodes(editor, { type: 'bulleted-list', children: [] })
}

function liftListItemToParagraph(editor: CustomEditor) {
  Transforms.unwrapNodes(editor, {
    match: (node) => Element.isElement(node) && node.type === 'bulleted-list',
    split: true,
  })
  Transforms.setNodes(
    editor,
    { type: 'paragraph' } as Partial<CustomElement>,
    { match: isListItemElement },
  )
}

function getCurrentListItem(editor: CustomEditor) {
  const entry = Editor.above(editor, { match: isListItemElement })
  if (!entry || !Element.isElement(entry[0]) || entry[0].type !== 'list-item') {
    return null
  }

  return entry
}

function isEditableTextBlock(editor: CustomEditor, node: Node) {
  return (
    Element.isElement(node) &&
    Editor.isBlock(editor, node) &&
    node.type !== 'bulleted-list'
  )
}

function isListItemElement(node: Node) {
  return Element.isElement(node) && node.type === 'list-item'
}
