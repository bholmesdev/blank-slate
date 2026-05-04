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

test('Enter at the start of a nested item lifts it to the parent level', async ({ page }) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'beta')
  await page.keyboard.press('Enter')

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

test('Enter at the start of a parent item moves its child list to a new empty sibling', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'alpha')
  await page.keyboard.press('Enter')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        {
          tag: 'li',
          children: [
            { tag: 'p', text: '', children: [] },
            {
              tag: 'ul',
              children: [{ tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] }],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- \n  - beta')
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
  await page.locator('.editor').evaluate((editor, targetText) => {
    const paragraphs = Array.from(editor.querySelectorAll('p'))
    const paragraph = paragraphs.find((candidate) => {
      return (
        Array.from(candidate.querySelectorAll('[data-slate-string="true"]'))
          .map((leaf) => leaf.textContent ?? '')
          .join('') === targetText
      )
    })
    if (!paragraph) throw new Error(`Could not find list item paragraph: ${targetText}`)

    const textNode = paragraph.querySelector('[data-slate-string="true"]')?.firstChild
    if (!textNode) throw new Error(`Could not find text node for: ${targetText}`)

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.collapse(true)

    const selection = window.getSelection()
    if (!selection) throw new Error('Could not read window selection')
    selection.removeAllRanges()
    selection.addRange(range)
  }, text)
}
