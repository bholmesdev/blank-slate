import type { BaseEditor } from 'slate'
import type { HistoryEditor } from 'slate-history'
import type { ReactEditor } from 'slate-react'

export type BlockType =
  | 'paragraph'
  | 'heading-one'
  | 'heading-two'
  | 'heading-three'
  | 'bulleted-list'
  | 'numbered-list'
  | 'task-list'

export type ParagraphElement = {
  type: 'paragraph'
  children: CustomText[]
}

export type HeadingElement = {
  type: 'heading-one' | 'heading-two' | 'heading-three'
  children: CustomText[]
}

export type ListElement = {
  type: 'bulleted-list' | 'numbered-list' | 'task-list'
  children: ListItemElement[]
}

export type ListItemElement = {
  type: 'list-item'
  checked?: boolean
  children: Array<ParagraphElement | ListElement>
}

export type CustomElement =
  | ParagraphElement
  | HeadingElement
  | ListElement
  | ListItemElement

export type CustomText = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  code?: boolean
}

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor
export type SlateDocument = CustomElement[]

declare module 'slate' {
  interface CustomTypes {
    Editor: CustomEditor
    Element: CustomElement
    Text: CustomText
  }
}
