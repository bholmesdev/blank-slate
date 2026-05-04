import { useCallback, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { createEditor } from 'slate'
import { withHistory } from 'slate-history'
import {
  Editable,
  Slate,
  useSlate,
  withReact,
  type RenderElementProps,
  type RenderLeafProps,
} from 'slate-react'
import './App.css'
import {
  activeMarks,
  handleListKeyDown,
  handleMarkdownShortcut,
  handleReturnInEmptyHeading,
  isBlockActive,
  isMarkActive,
  toggleBlock,
  toggleMark,
  type MarkType,
} from './editorCommands'
import {
  deserializeMarkdown,
  initialMarkdown,
  serializeMarkdown,
} from './markdown'
import type { BlockType, CustomElement, CustomText, SlateDocument } from './slate'

const storageKey = 'blank-slate.markdown'

function App() {
  const [editorVersion, setEditorVersion] = useState(0)
  const [editor, setEditor] = useState(createSlateEditor)
  const [markdown, setMarkdown] = useState(() => {
    return window.localStorage.getItem(storageKey) ?? initialMarkdown
  })
  const [value, setValue] = useState<SlateDocument>(() => deserializeMarkdown(markdown))

  const renderElement = useCallback((props: RenderElementProps) => <Element {...props} />, [])
  const renderLeaf = useCallback((props: RenderLeafProps) => <Leaf {...props} />, [])

  return (
    <main className="shell">
      <section className="workspace" aria-label="Slate Markdown editor">
        <header className="topbar">
          <div>
            <p className="eyebrow">Slate prototype</p>
            <h1>Markdown-first editor</h1>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setMarkdown(initialMarkdown)
              setValue(deserializeMarkdown(initialMarkdown))
              window.localStorage.setItem(storageKey, initialMarkdown)
              setEditor(createSlateEditor())
              setEditorVersion((version) => version + 1)
            }}
          >
            Reset document
          </button>
        </header>

        <Slate
          key={editorVersion}
          editor={editor}
          initialValue={value}
          onChange={(nextValue) => {
            const slateValue = nextValue as SlateDocument
            const nextMarkdown = serializeMarkdown(slateValue)
            setValue(slateValue)
            setMarkdown(nextMarkdown)
            window.localStorage.setItem(storageKey, nextMarkdown)
          }}
        >
          <Toolbar />
          <div className="editor-frame">
            <Editable
              className="editor"
              placeholder="Write Markdown..."
              renderElement={renderElement}
              renderLeaf={renderLeaf}
              spellCheck
              onKeyDown={(event) => {
                if (handleMarkdownShortcut(editor, event)) return
                if (handleListKeyDown(editor, event)) return
                if (handleReturnInEmptyHeading(editor, event)) return

                if (!event.metaKey && !event.ctrlKey) return

                const key = event.key.toLowerCase()
                const markByKey: Record<string, MarkType> = {
                  b: 'bold',
                  i: 'italic',
                  u: 'underline',
                  e: 'code',
                }

                const mark = markByKey[key]
                if (!mark) return

                event.preventDefault()
                toggleMark(editor, mark)
              }}
            />
          </div>
          <StatusBar />
        </Slate>
      </section>

      <aside className="markdown-panel" aria-label="Serialized Markdown">
        <div className="panel-header">
          <h2>Markdown output</h2>
          <span>localStorage</span>
        </div>
        <pre>{markdown}</pre>
      </aside>
    </main>
  )
}

function Toolbar() {
  return (
    <div className="toolbar" aria-label="Formatting toolbar">
      <BlockButton blockType="paragraph" label="P" title="Paragraph" />
      <BlockButton blockType="heading-one" label="H1" title="Heading 1" />
      <BlockButton blockType="heading-two" label="H2" title="Heading 2" />
      <BlockButton blockType="heading-three" label="H3" title="Heading 3" />
      <BlockButton blockType="bulleted-list" label="Bullet" title="Bulleted list" />
      <span className="toolbar-divider" />
      <MarkButton mark="bold" label="B" title="Bold" />
      <MarkButton mark="italic" label="I" title="Italic" />
      <MarkButton mark="underline" label="U" title="Underline" />
      <MarkButton mark="code" label="Code" title="Inline code" />
    </div>
  )
}

function BlockButton({
  blockType,
  label,
  title,
}: {
  blockType: BlockType
  label: string
  title: string
}) {
  const editor = useSlate()
  const active = isBlockActive(editor, blockType)

  return (
    <button
      aria-pressed={active}
      className="toolbar-button"
      title={title}
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        toggleBlock(editor, blockType)
      }}
    >
      {label}
    </button>
  )
}

function MarkButton({
  mark,
  label,
  title,
}: {
  mark: MarkType
  label: string
  title: string
}) {
  const editor = useSlate()
  const active = isMarkActive(editor, mark)

  return (
    <button
      aria-pressed={active}
      className="toolbar-button"
      title={title}
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        toggleMark(editor, mark)
      }}
    >
      {label}
    </button>
  )
}

function StatusBar() {
  const editor = useSlate()
  const marks = activeMarks(editor)

  return (
    <div className="statusbar">
      <span>Hotkeys: Cmd/Ctrl+B, I, U, E</span>
      <span>{marks.length > 0 ? `Active marks: ${marks.join(', ')}` : 'No active marks'}</span>
    </div>
  )
}

function Element({ attributes, children, element }: ElementProps) {
  switch (element.type) {
    case 'bulleted-list':
      return <ul {...attributes}>{children}</ul>
    case 'list-item':
      return <li {...attributes}>{children}</li>
    case 'heading-one':
      return <h1 {...attributes}>{children}</h1>
    case 'heading-two':
      return <h2 {...attributes}>{children}</h2>
    case 'heading-three':
      return <h3 {...attributes}>{children}</h3>
    default:
      return <p {...attributes}>{children}</p>
  }
}

function Leaf({ attributes, children, leaf }: LeafProps) {
  let formatted = children
  if (leaf.code) formatted = <code>{formatted}</code>
  if (leaf.bold) formatted = <strong>{formatted}</strong>
  if (leaf.italic) formatted = <em>{formatted}</em>
  if (leaf.underline) formatted = <u>{formatted}</u>

  return <span {...attributes}>{formatted}</span>
}

type ElementProps = Omit<RenderElementProps, 'element'> & {
  attributes: HTMLAttributes<HTMLElement>
  children: ReactNode
  element: CustomElement
}

type LeafProps = Omit<RenderLeafProps, 'leaf'> & {
  attributes: HTMLAttributes<HTMLSpanElement>
  children: ReactNode
  leaf: CustomText
}

function createSlateEditor() {
  return withHistory(withReact(createEditor()))
}

export default App
