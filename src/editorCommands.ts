import { Editor, Element, Node, Range, Transforms } from 'slate'
import type { KeyboardEvent } from 'react'
import type { BlockType, CustomEditor, CustomText } from './slate'

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
  Transforms.setNodes(
    editor,
    { type: blockType },
    { match: (node) => Element.isElement(node) && Editor.isBlock(editor, node) },
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

export function activeMarks(editor: CustomEditor) {
  return inlineMarks.filter((mark) => isMarkActive(editor, mark))
}

function headingTypeFromMarkdownToken(token: string): BlockType | null {
  if (token === '#') return 'heading-one'
  if (token === '##') return 'heading-two'
  if (token === '###') return 'heading-three'
  return null
}
