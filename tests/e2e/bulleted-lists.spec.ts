import { expect, test, type Page } from '@playwright/test'

type EditorNode = {
  tag: string
  text?: string
  children: EditorNode[]
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('blank-slate.markdown', '')
  })
  await page.goto('/')
  await clearEditor(page)
})

test('markdown shortcut creates a bulleted list item', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [{ tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] }],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha')
})

test('Enter at the end of a list item creates a sibling item', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('beta')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- beta')
})

test('Enter at the end of a parent item with children creates a top-level sibling', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextEnd(page, 'alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('gamma')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ul',
              children: [{ tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] }],
            },
          ],
        },
        { tag: 'li', children: [{ tag: 'p', text: 'gamma', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n  - beta\n- gamma')
})

test('Tab nests a list item under its previous sibling', async ({ page }) => {
  await typeTwoItemList(page)
  await page.keyboard.press('Tab')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ul',
              children: [{ tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] }],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n  - beta')
})

test('Tab on the first list item leaves it top-level', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha')
  await page.keyboard.press('Tab')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [{ tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] }],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha')
})

test('Shift+Tab lifts a nested item to the parent level', async ({ page }) => {
  await typeNestedList(page)
  await page.keyboard.press('Shift+Tab')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- beta')
})

test('Shift+Tab on a top-level item leaves it top-level', async ({ page }) => {
  await typeTwoItemList(page)
  await page.keyboard.press('Shift+Tab')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- beta')
})

test('Enter at the end of a nested item creates a nested sibling', async ({ page }) => {
  await typeNestedList(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('gamma')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ul',
              children: [
                { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
                { tag: 'li', children: [{ tag: 'p', text: 'gamma', children: [] }] },
              ],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n  - beta\n  - gamma')
})

test('Enter in the middle of a list item splits it into sibling items', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha beta')
  await setCaretInListItemText(page, 'alpha beta', 'alpha '.length)
  await page.keyboard.press('Enter')
  await page.keyboard.type('next ')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha ', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'next beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha \n- next beta')
})

test('Enter in the middle of a list item preserves text on both sides before typing', async ({
  page,
}) => {
  await typeMarkdownListItem(page, 'exampleprompt')
  await setCaretInListItemText(page, 'exampleprompt', 'example'.length)
  await page.keyboard.press('Enter')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'example', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'prompt', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- example\n- prompt')
})

test('Backspace at the start of a nested item lifts it to the parent level', async ({ page }) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'beta')
  await page.keyboard.press('Backspace')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- beta')
})

test('Backspace at the start of a nested item preserves cursor position after lift', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'beta')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: '!beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- !beta')
})

test('Enter at the start of a nested item creates an empty nested sibling before it', async ({ page }) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'beta')
  await page.keyboard.press('Enter')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ul',
              children: [
                { tag: 'li', children: [{ tag: 'p', text: '', children: [] }] },
                { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
              ],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n  - \n  - beta')
})

test('Enter at the start of a nested item preserves cursor position in the new item', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'beta')
  await page.keyboard.press('Enter')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ul',
              children: [
                { tag: 'li', children: [{ tag: 'p', text: '!', children: [] }] },
                { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
              ],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n  - !\n  - beta')
})

test('Delete at the start of a nested item lifts it and preserves cursor position', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'beta')
  await page.keyboard.press('Delete')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: '!beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- !beta')
})

test('Shift+Tab on a nested item lifts it and preserves cursor position', async ({ page }) => {
  await typeNestedList(page)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'beta!', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- beta!')
})

test('Backspace at the start of a parent item promotes its nested children', async ({ page }) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'alpha')
  await page.keyboard.press('Backspace')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- beta')
})

test('Delete at the start of a parent item exits it to a paragraph and promotes children', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'alpha')
  await page.keyboard.press('Delete')

  await expect(editorTree(page)).resolves.toEqual([
    { tag: 'p', text: 'alpha', children: [] },
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('alpha\n\n- beta')
})

test('Enter at the start of a parent item creates an empty sibling before it', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'alpha')
  await page.keyboard.press('Enter')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: '', children: [] }] },
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ul',
              children: [{ tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] }],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- \n- alpha\n  - beta')
})

test('toolbar Bullet toggles a paragraph into and out of a list', async ({ page }) => {
  await page.locator('.editor').click()
  await page.keyboard.type('alpha')
  await page.getByRole('button', { name: 'Bullet' }).click()

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [{ tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] }],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha')

  await page.getByRole('button', { name: 'Bullet' }).click()

  await expect(editorTree(page)).resolves.toEqual([
    { tag: 'p', text: 'alpha', children: [] },
  ])
  await expect(markdownOutput(page)).resolves.toBe('alpha')
})

async function clearEditor(page: Page) {
  await page.locator('.editor').click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.press('Backspace')
  await expect(editorTree(page)).resolves.toEqual([{ tag: 'p', text: '', children: [] }])
}

async function typeMarkdownListItem(page: Page, text: string) {
  await page.locator('.editor').click()
  await page.keyboard.type('-')
  await page.keyboard.press('Space')
  await page.keyboard.type(text)
}

async function typeTwoItemList(page: Page) {
  await typeMarkdownListItem(page, 'alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('beta')
}

async function typeNestedList(page: Page) {
  await typeTwoItemList(page)
  await page.keyboard.press('Tab')
}

function markdownOutput(page: Page) {
  return page.locator('.markdown-panel pre').innerText()
}

function editorTree(page: Page) {
  return page.locator('.editor').evaluate((editor) => {
    function serializeElement(element: Element): EditorNode | null {
      const tag = element.tagName.toLowerCase()
      if (!['p', 'ul', 'li'].includes(tag)) return null

      const children = Array.from(element.children)
        .map(serializeElement)
        .filter((child): child is EditorNode => child !== null)

      const node: EditorNode = { tag, children }
      if (tag === 'p') {
        node.text = Array.from(element.querySelectorAll('[data-slate-string="true"]'))
          .map((leaf) => leaf.textContent ?? '')
          .join('')
      }
      return node
    }

    return Array.from(editor.children)
      .map(serializeElement)
      .filter((child): child is EditorNode => child !== null)
  })
}

async function setCaretAtListItemTextStart(page: Page, text: string) {
  await setCaretInListItemText(page, text, 0)
}

async function setCaretAtListItemTextEnd(page: Page, text: string) {
  await setCaretInListItemText(page, text, text.length)
}

async function setCaretInListItemText(page: Page, text: string, offset: number) {
  await page.locator('.editor').evaluate((editor, target) => {
    const { text, offset } = target
    const paragraphs = Array.from(editor.querySelectorAll('p'))
    const paragraph = paragraphs.find((candidate) => {
      return (
        Array.from(candidate.querySelectorAll('[data-slate-string="true"]'))
          .map((leaf) => leaf.textContent ?? '')
          .join('') === text
      )
    })
    if (!paragraph) throw new Error(`Could not find list item paragraph: ${text}`)

    const textNode = paragraph.querySelector('[data-slate-string="true"]')?.firstChild
    if (!textNode) throw new Error(`Could not find text node for: ${text}`)

    const range = document.createRange()
    range.setStart(textNode, offset)
    range.collapse(true)

    const selection = window.getSelection()
    if (!selection) throw new Error('Could not read window selection')
    selection.removeAllRanges()
    selection.addRange(range)
  }, { text, offset })
}
