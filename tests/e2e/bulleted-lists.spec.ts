import { expect, test, type Page } from '@playwright/test'

type EditorNode = {
  tag: string
  text?: string
  dataType?: string
  checked?: string
  hasButton?: boolean
  children: EditorNode[]
}

type ListKind = 'bulleted' | 'numbered' | 'task'

const listKinds: ListKind[] = ['bulleted', 'numbered', 'task']

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

test('markdown shortcut creates a numbered list item', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha', '1.')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ol',
      children: [{ tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] }],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('1. alpha')
})

test('markdown shortcut creates an unchecked task list item', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha', '-[]')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      dataType: 'taskList',
      children: [
        {
          tag: 'li',
          dataType: 'taskItem',
          checked: 'false',
          hasButton: true,
          children: [{ tag: 'p', text: 'alpha', children: [] }],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- [ ] alpha')
})

test('markdown shortcut creates a checked task list item', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha', '-[x]')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      dataType: 'taskList',
      children: [
        {
          tag: 'li',
          dataType: 'taskItem',
          checked: 'true',
          hasButton: true,
          children: [{ tag: 'p', text: 'alpha', children: [] }],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- [x] alpha')
})

test('standard markdown task shorthand converts a bullet into a task item', async ({ page }) => {
  await typeMarkdownListItem(page, '', '-')
  await page.keyboard.type('[x]')
  await page.keyboard.press('Space')
  await page.keyboard.type('alpha')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      dataType: 'taskList',
      children: [
        {
          tag: 'li',
          dataType: 'taskItem',
          checked: 'true',
          hasButton: true,
          children: [{ tag: 'p', text: 'alpha', children: [] }],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- [x] alpha')
})

test('task item button checks and unchecks an item', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha', '-[]')

  const checkbox = page.locator('li[data-type="taskItem"] button').first()
  await checkbox.click()
  await expect(markdownOutput(page)).resolves.toBe('- [x] alpha')

  await checkbox.click()
  await expect(markdownOutput(page)).resolves.toBe('- [ ] alpha')
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

test('Tab nests a numbered list item under its previous sibling', async ({ page }) => {
  await typeTwoItemList(page, '1.')
  await page.keyboard.press('Tab')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ol',
      children: [
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ol',
              children: [{ tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] }],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('1. alpha\n  1. beta')
})

test('Tab nests a task list item under its previous sibling', async ({ page }) => {
  await typeTwoItemList(page, '-[x]')
  await page.keyboard.press('Tab')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      dataType: 'taskList',
      children: [
        {
          tag: 'li',
          dataType: 'taskItem',
          checked: 'true',
          hasButton: true,
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ul',
              dataType: 'taskList',
              children: [
                {
                  tag: 'li',
                  dataType: 'taskItem',
                  checked: 'false',
                  hasButton: true,
                  children: [{ tag: 'p', text: 'beta', children: [] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- [x] alpha\n  - [ ] beta')
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

test('Shift+Tab lifts a nested numbered item to the parent level', async ({ page }) => {
  await typeNestedList(page, '1.')
  await page.keyboard.press('Shift+Tab')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ol',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('1. alpha\n2. beta')
})

test('mixed nested list parents preserve their own markdown markers', async ({ page }) => {
  await loadMarkdown(page, '- alpha\n  1. beta\n  2. gamma\n- delta\n  - [x] task')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'alpha', children: [] },
            {
              tag: 'ol',
              children: [
                { tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] },
                { tag: 'li', children: [{ tag: 'p', text: 'gamma', children: [] }] },
              ],
            },
          ],
        },
        {
          tag: 'li',
          children: [
            { tag: 'p', text: 'delta', children: [] },
            {
              tag: 'ul',
              dataType: 'taskList',
              children: [
                {
                  tag: 'li',
                  dataType: 'taskItem',
                  checked: 'true',
                  hasButton: true,
                  children: [{ tag: 'p', text: 'task', children: [] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe(
    '- alpha\n  1. beta\n  2. gamma\n- delta\n  - [x] task',
  )
})

for (const parentKind of listKinds) {
  for (const childKind of listKinds) {
    test(`Tab nests first ${childKind} list item under previous ${parentKind} list`, async ({
      page,
    }) => {
      await typeAdjacentLists(page, parentKind, childKind)
      await setCaretAtListItemTextEnd(page, 'Child')
      await page.keyboard.press('Tab')

      await expect(editorTree(page)).resolves.toEqual([
        listNode(parentKind, [
          listItemNode(parentKind, [
            { tag: 'p', text: 'Parent', children: [] },
            listNode(childKind, [
              listItemNode(childKind, [{ tag: 'p', text: 'Child', children: [] }]),
            ]),
          ]),
        ]),
      ])
      await expect(markdownOutput(page)).resolves.toBe(
        `${markdownListLine(parentKind, 'Parent')}\n  ${markdownListLine(childKind, 'Child')}`,
      )
    })
  }
}

test('Tab nests the first item of a following list and preserves its siblings', async ({
  page,
}) => {
  await loadMarkdown(page, '1. Parent\n\n- Child\n- Sibling')
  await setCaretAtListItemTextEnd(page, 'Child')
  await page.keyboard.press('Tab')

  await expect(editorTree(page)).resolves.toEqual([
    listNode('numbered', [
      listItemNode('numbered', [
        { tag: 'p', text: 'Parent', children: [] },
        listNode('bulleted', [
          listItemNode('bulleted', [{ tag: 'p', text: 'Child', children: [] }]),
        ]),
      ]),
    ]),
    listNode('bulleted', [
      listItemNode('bulleted', [{ tag: 'p', text: 'Sibling', children: [] }]),
    ]),
  ])
  await expect(markdownOutput(page)).resolves.toBe('1. Parent\n  - Child\n\n- Sibling')
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

test('Enter on an empty top-level list item exits the list', async ({ page }) => {
  await typeMarkdownListItem(page, '')
  await page.keyboard.press('Enter')

  await expect(editorTree(page)).resolves.toEqual([{ tag: 'p', text: '', children: [] }])
  await expect(markdownOutput(page)).resolves.toBe('')
})

test('Enter on an empty nested list item lifts it to the parent level', async ({ page }) => {
  await typeMarkdownListItem(page, 'alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'alpha', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: '!', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n- !')
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

test('Enter at the start of a nested item preserves cursor position in the original item', async ({
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
                { tag: 'li', children: [{ tag: 'p', text: '', children: [] }] },
                { tag: 'li', children: [{ tag: 'p', text: '!beta', children: [] }] },
              ],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- alpha\n  - \n  - !beta')
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

test('Backspace at the start of a parent item exits it to a paragraph and promotes children', async ({ page }) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'alpha')
  await page.keyboard.press('Backspace')

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

test('Delete at the start of a parent item preserves previous sibling order', async ({
  page,
}) => {
  await typeThreeItemList(page, ['Type - or * followed by Space to start a bulleted list.', 'One', 'Two'])
  await setCaretAtListItemTextStart(page, 'Two')
  await page.keyboard.press('Tab')
  await setCaretAtListItemTextStart(page, 'One')
  await page.keyboard.press('Delete')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        {
          tag: 'li',
          children: [
            {
              tag: 'p',
              text: 'Type - or * followed by Space to start a bulleted list.',
              children: [],
            },
          ],
        },
      ],
    },
    { tag: 'p', text: '!One', children: [] },
    {
      tag: 'ul',
      children: [{ tag: 'li', children: [{ tag: 'p', text: 'Two', children: [] }] }],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe(
    '- Type - or \\* followed by Space to start a bulleted list.\n\n!One\n\n- Two',
  )
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

test('Enter at the start of a parent item preserves cursor position in the original item', async ({
  page,
}) => {
  await typeNestedList(page)
  await setCaretAtListItemTextStart(page, 'alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: '', children: [] }] },
        {
          tag: 'li',
          children: [
            { tag: 'p', text: '!alpha', children: [] },
            {
              tag: 'ul',
              children: [{ tag: 'li', children: [{ tag: 'p', text: 'beta', children: [] }] }],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- \n- !alpha\n  - beta')
})

test('Delete at the start of a nested item lifts following siblings under the lifted item', async ({
  page,
}) => {
  await typeThreeItemList(page, ['Parent', 'One', 'Two'])
  await setCaretAtListItemTextStart(page, 'One')
  await page.keyboard.press('Tab')
  await setCaretAtListItemTextStart(page, 'Two')
  await page.keyboard.press('Tab')
  await setCaretAtListItemTextStart(page, 'One')
  await page.keyboard.press('Delete')
  await page.keyboard.type('!')

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'Parent', children: [] }] },
        {
          tag: 'li',
          children: [
            { tag: 'p', text: '!One', children: [] },
            {
              tag: 'ul',
              children: [{ tag: 'li', children: [{ tag: 'p', text: 'Two', children: [] }] }],
            },
          ],
        },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- Parent\n- !One\n  - Two')
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

test('adjacent bulleted list chunks are normalized into one list', async ({ page }) => {
  await typeThreeItemList(page, ['One', 'Two', 'Three'])
  await setCaretAtListItemTextStart(page, 'Two')
  await page.keyboard.press('Backspace')
  await page.getByRole('button', { name: 'Bullet' }).click()

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'One', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'Two', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'Three', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- One\n- Two\n- Three')
})

test('loaded adjacent markdown list chunks are normalized into one list', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('blank-slate.markdown', '- First\n- Second\n\n- First')
  })
  await page.reload()

  await expect(editorTree(page)).resolves.toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: [{ tag: 'p', text: 'First', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'Second', children: [] }] },
        { tag: 'li', children: [{ tag: 'p', text: 'First', children: [] }] },
      ],
    },
  ])
  await expect(markdownOutput(page)).resolves.toBe('- First\n- Second\n- First')
})

test('opening unsupported markdown does not rewrite storage before editing', async ({ page }) => {
  const source = '[link](https://example.com)'

  await page.addInitScript((markdown) => {
    window.localStorage.setItem('blank-slate.markdown', markdown)
  }, source)
  await page.reload()

  await expect(storedMarkdown(page)).resolves.toBe(source)

  await page.locator('.editor').click()
  await expect(storedMarkdown(page)).resolves.toBe(source)

  await page.keyboard.type('!')
  await expect(storedMarkdown(page)).resolves.toBe('link!')
})

async function clearEditor(page: Page) {
  await page.locator('.editor').click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.press('Backspace')
  await expect(editorTree(page)).resolves.toEqual([{ tag: 'p', text: '', children: [] }])
}

async function typeMarkdownListItem(page: Page, text: string, marker = '-') {
  await page.locator('.editor').click()
  await page.keyboard.type(marker)
  await page.keyboard.press('Space')
  await page.keyboard.type(text)
}

async function typeTwoItemList(page: Page, marker = '-') {
  await typeMarkdownListItem(page, 'alpha', marker)
  await page.keyboard.press('Enter')
  await page.keyboard.type('beta')
}

async function typeThreeItemList(page: Page, items: [string, string, string]) {
  await typeMarkdownListItem(page, items[0])
  await page.keyboard.press('Enter')
  await page.keyboard.type(items[1])
  await page.keyboard.press('Enter')
  await page.keyboard.type(items[2])
}

async function typeNestedList(page: Page, marker = '-') {
  await typeTwoItemList(page, marker)
  await page.keyboard.press('Tab')
}

async function typeAdjacentLists(page: Page, parentKind: ListKind, childKind: ListKind) {
  await typeMarkdownListItem(page, 'Parent', markdownShortcut(parentKind))
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type(markdownShortcut(childKind))
  await page.keyboard.press('Space')
  await page.keyboard.type('Child')
}

async function loadMarkdown(page: Page, markdown: string) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('blank-slate.markdown', value)
  }, markdown)
  await page.reload()
}

function markdownOutput(page: Page) {
  return page.locator('.markdown-panel pre').innerText()
}

function storedMarkdown(page: Page) {
  return page.evaluate(() => window.localStorage.getItem('blank-slate.markdown'))
}

function markdownListLine(kind: ListKind, text: string) {
  if (kind === 'numbered') return `1. ${text}`
  if (kind === 'task') return `- [ ] ${text}`
  return `- ${text}`
}

function markdownShortcut(kind: ListKind) {
  if (kind === 'numbered') return '1.'
  if (kind === 'task') return '-[]'
  return '-'
}

function listNode(kind: ListKind, children: EditorNode[]): EditorNode {
  return {
    tag: kind === 'numbered' ? 'ol' : 'ul',
    ...(kind === 'task' ? { dataType: 'taskList' } : {}),
    children,
  }
}

function listItemNode(kind: ListKind, children: EditorNode[]): EditorNode {
  return {
    tag: 'li',
    ...(kind === 'task'
      ? { dataType: 'taskItem', checked: 'false', hasButton: true }
      : {}),
    children,
  }
}

function editorTree(page: Page) {
  return page.locator('.editor').evaluate((editor) => {
    function serializeElement(element: Element): EditorNode[] {
      const tag = element.tagName.toLowerCase()
      if (!['p', 'ul', 'ol', 'li'].includes(tag)) {
        return Array.from(element.children).flatMap(serializeElement)
      }

      const children = Array.from(element.children)
        .flatMap(serializeElement)

      const node: EditorNode = { tag, children }
      if (tag === 'p') {
        node.text = Array.from(element.querySelectorAll('[data-slate-string="true"]'))
          .map((leaf) => leaf.textContent ?? '')
          .join('')
      }
      if (element instanceof HTMLElement) {
        const dataType = element.dataset.type
        if (dataType) node.dataType = dataType
        if (element.dataset.checked) node.checked = element.dataset.checked
        if (element.querySelector(':scope > label > button')) node.hasButton = true
      }
      return [node]
    }

    return Array.from(editor.children).flatMap(serializeElement)
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
