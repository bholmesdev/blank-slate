import type { BaseEditor } from 'slate'
import type { HistoryEditor } from 'slate-history'
import type { ReactEditor } from 'slate-react'

export type BlockType = 'paragraph' | 'heading-one' | 'heading-two' | 'heading-three'

export type ParagraphElement = {
  type: 'paragraph'
  children: CustomText[]
}

export type HeadingElement = {
  type: 'heading-one' | 'heading-two' | 'heading-three'
  children: CustomText[]
}

export type CustomElement = ParagraphElement | HeadingElement

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
