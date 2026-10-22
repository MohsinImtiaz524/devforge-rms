const { chromium } = require('@playwright/test')
const assert = require('node:assert/strict')
let createdPayload = null

const user = {
  id: 1,
  shop_id: 1,
  name: 'Admin',
  role: 'admin',
  shop_currency: 'PKR',
  permissions: [
    'expenses.view', 'expenses.create', 'expenses.update', 'expenses.delete',
    'expenses.approve', 'expenses.export', 'expenses.manage_recurring'
  ]
}
const superUser = { id: 4, shop_id: null, name: 'Platform Owner', role: 'superadmin', shop_currency: 'PKR', permissions: [] }
const categories = [{ id: 1, name: 'Utilities', emoji: '\u26A1', is_active: true }]
const expense = {
  id: 1,
  user_id: 2,
  title: 'Electricity bill',
  category_id: 1,
  category_name: 'Utilities',
  category_emoji: '\u26A1',
  amount: 125.5,
  date: '2026-10-19',
  vendor: 'Grid',
  reference_number: 'INV-1',
  status: 'pending_review',
  version: 0,
  submitted_by: 'Cashier',
  receipt_id: null
}

async function configure(page, sessionUser = user, categoryRows = categories) {
  await page.route('**/service-worker.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.route('**/api/**', route => {
    const requestUrl = new URL(route.request().url())
    const pathname = requestUrl.pathname
    if (!pathname.startsWith('/api/')) return route.continue()
    if (pathname === '/api/expenses' && route.request().method() === 'POST') {
      createdPayload = route.request().postDataJSON()
      return route.fulfill({ json: { ...expense, id: 2, user_id: 1, title: createdPayload.title, status: 'approved' } })
    }
    const body = pathname === '/api/auth/me' ? { user: sessionUser }
      : pathname === '/api/lobby' ? { modules: [] }
      : pathname === '/api/notifications/unread-count' ? { count: 0 }
      : pathname === '/api/expenses/categories' ? categoryRows
      : pathname === '/api/expenses/recurring' ? { items: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 1 } }
      : pathname === '/api/expenses' ? {
          items: [{ ...expense, ...(requestUrl.searchParams.get('status') === 'archived' ? { status: 'archived', version: 2, archive_reason: 'Duplicate record' } : {}) }],
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
          summary: { approved_total: 0, pending_total: 125.5, pending_count: 1 }
        }
      : {}
    return route.fulfill({ json: body })
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: async () => ({}) }
  }))
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    for (const width of [1280, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text())
      })
      await configure(page)
      await page.goto('http://127.0.0.1:5173/app/expenses')
      await page.getByRole('heading', { name: 'Expenses', exact: true }).waitFor()
      const sidebarLayout = await page.evaluate(() => {
        const sidebar = document.querySelector('.expense-sidebar')
        const content = document.querySelector('.expenses-content')
        const tabs = document.querySelector('.expense-tabs')
        const sidebarRect = sidebar.getBoundingClientRect()
        const contentRect = content.getBoundingClientRect()
        return {
          sidebarLeft: sidebarRect.left, sidebarRight: sidebarRect.right, sidebarBottom: sidebarRect.bottom,
          contentLeft: contentRect.left, contentTop: contentRect.top,
          sidebarPosition: getComputedStyle(sidebar).position,
          tabDirection: getComputedStyle(tabs).flexDirection
        }
      })
      if (width > 900) {
        assert.equal(sidebarLayout.sidebarPosition, 'fixed', width + 'px sidebar must stay fixed during scroll')
        assert.ok(sidebarLayout.sidebarLeft < sidebarLayout.contentLeft, width + 'px sidebar must be left of content')
        assert.ok(sidebarLayout.contentLeft - sidebarLayout.sidebarRight >= 27, width + 'px sidebar gap is too small')
        assert.equal(sidebarLayout.tabDirection, 'column', width + 'px sidebar navigation must be vertical')
        const fixedTopBeforeScroll = await page.locator('.expense-sidebar').evaluate(element => element.getBoundingClientRect().top)
        await page.evaluate(() => { document.body.style.minHeight = '2000px'; window.scrollTo(0, 600) })
        await page.waitForTimeout(80)
        const fixedTopAfterScroll = await page.locator('.expense-sidebar').evaluate(element => element.getBoundingClientRect().top)
        assert.equal(fixedTopAfterScroll, fixedTopBeforeScroll, 'sidebar must remain fixed while the page scrolls')
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.getByRole('button', { name: 'Collapse Expenses sidebar' }).click()
        await page.waitForTimeout(250)
        const collapsed = await page.evaluate(() => ({
          sidebarWidth: document.querySelector('.expense-sidebar').getBoundingClientRect().width,
          spacerWidth: document.querySelector('.expense-sidebar-spacer').getBoundingClientRect().width,
          labelDisplay: getComputedStyle(document.querySelector('.expense-tabs button span')).display,
          stored: localStorage.getItem('rms_expenses_sidebar_collapsed')
        }))
        assert.ok(collapsed.sidebarWidth <= 72.5 && collapsed.spacerWidth <= 72.5, 'collapsed sidebar and spacer must match')
        assert.equal(collapsed.labelDisplay, 'none', 'collapsed sidebar labels must be icon-only')
        assert.equal(collapsed.stored, 'true', 'collapsed state must be persisted')
        await page.reload()
        await page.getByRole('heading', { name: 'Expenses', exact: true }).waitFor()
        assert.ok(await page.locator('.expense-sidebar.collapsed').count(), 'collapsed state must survive reload')
        await page.getByRole('button', { name: 'Expand Expenses sidebar' }).click()
      } else {
        assert.equal(sidebarLayout.sidebarPosition, 'static', width + 'px sidebar must join mobile document flow')
        assert.ok(sidebarLayout.sidebarBottom <= sidebarLayout.contentTop, width + 'px navigation must be above content')
        assert.equal(sidebarLayout.tabDirection, 'row', width + 'px mobile navigation must be horizontal')
      }
      if (width === 1280) {
        await page.locator('[aria-label="Actions for Electricity bill"]:visible').first().click()
        await page.getByRole('menuitem', { name: 'Archive' }).click()
        const archiveReason = page.getByLabel('Archive reason *')
        await archiveReason.pressSequentially('test reason', { delay: 15 })
        assert.equal(await archiveReason.inputValue(), 'test reason', 'archive reason must retain every typed character')
        assert.equal(await archiveReason.evaluate(element => document.activeElement === element), true, 'archive reason must retain keyboard focus')
        await page.getByRole('button', { name: 'Cancel' }).click()
        await page.getByRole('button', { name: /Filters/ }).click()
        await page.getByLabel('Minimum amount').fill('100')
        await page.waitForFunction(() => new URL(location.href).searchParams.get('min_amount') === '100')
        await page.getByRole('button', { name: 'Clear all filters' }).click()
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('min_amount'))
        await page.getByRole('button', { name: 'Approvals', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Add Expense' }).click()
        await page.getByLabel('Title *').fill('Create contract check')
        await page.getByRole('spinbutton', { name: /Amount \(PKR\)/ }).fill('42.50')
        await page.getByRole('button', { name: 'Submit Expense' }).click()
        await page.waitForFunction(() => !document.querySelector('.expense-modal'))
        assert.equal(Object.hasOwn(createdPayload, 'version'), false, 'new expense POST must omit edit-only version')
      }
      await page.getByRole('button', { name: /^Approvals/ }).click()
      assert.match(page.url(), /\/app\/expenses\/approvals/)
      await page.getByRole('button', { name: 'Archived' }).click()
      await page.getByRole('heading', { name: 'Archived Expenses', exact: true }).waitFor()
      
      assert.match(page.url(), /\/app\/expenses\/archived/)
      await page.getByRole('button', { name: 'Recurring' }).click()
      await page.getByRole('button', { name: 'Expenses', exact: true }).click()
      const overflow = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth
      }))
      assert.ok(overflow.scroll <= overflow.client + 1, `${width}px overflow ${overflow.scroll}/${overflow.client}`)
      assert.deepEqual(errors, [], `${width}px browser errors`)
      await page.close()
    }
    const superPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const superErrors = []
    superPage.on('pageerror', error => superErrors.push(error.message))
    await configure(superPage, superUser, [...categories, { id: 2, name: 'Legacy', emoji: '', is_active: false }])
    await superPage.goto('http://127.0.0.1:5173/app/expenses/categories')
    await superPage.getByRole('heading', { name: 'Expense Categories', exact: true }).waitFor()
    assert.equal(await superPage.getByRole('button', { name: 'Add Expense' }).count(), 0, 'Super Admin category catalog must not expose shop expense creation')
    await superPage.getByRole('button', { name: 'Add category' }).waitFor()
    await superPage.getByLabel('Actions for Legacy').click()
    await superPage.getByRole('menuitem', { name: 'Restore' }).waitFor()
    assert.deepEqual(superErrors, [], 'Super Admin category catalog browser errors')
    await superPage.close()
    console.log('PASS: Expenses desktop, tablet, and mobile tabs plus the Super Admin global category catalog render correctly.')
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
