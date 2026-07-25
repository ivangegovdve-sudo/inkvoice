import { expect, test } from '@playwright/test'
import { mockTTS } from './helpers/mockTTS'
import { navigateToBook } from './helpers/navigateToBook'
import { selectDifferentVoice } from './helpers/selectDifferentVoice'
import { TEST_BOOK_ID } from './helpers/testBook'

/**
 * Readers can choose a default TTS voice in settings and override it per book.
 * The global default persists across page refreshes, and per-book overrides
 * don't affect the global setting.
 */
test.describe('per-book voice selection', () => {
  /** Selecting a voice in settings propagates to the book page; overriding at book level leaves the global unchanged. */
  test('click-to-select voice in settings and verify book page reflects it', async ({ page }) => {
    await mockTTS(page)

    // 1. Go to settings and select a different voice
    await page.goto('/settings')
    const newVoiceName = await selectDifferentVoice(page)

    // 2. Navigate to a book
    await navigateToBook(page, TEST_BOOK_ID)

    // 3. Book voice selector should show "Default (<newVoiceName>)"
    const bookVoiceSelect = page.getByRole('combobox', { name: 'Voice' })

    await bookVoiceSelect.waitFor()
    await expect(bookVoiceSelect).toContainText(`Default (${newVoiceName})`)

    // 4. Override voice at book level
    await bookVoiceSelect.click()
    const bookListbox = page.getByRole('listbox')

    await bookListbox.waitFor()
    const bookOptions = await bookListbox.getByRole('option').all()

    let overrideOption = null

    for (const option of bookOptions) {
      const text = (await option.textContent()) ?? ''

      if (!text.includes('Default') && !text.includes(newVoiceName)) {
        overrideOption = option
        break
      }
    }

    if (overrideOption) {
      const overrideName = (await overrideOption.locator('span').first().textContent()) ?? ''

      await overrideOption.click()
      await expect(bookVoiceSelect).toContainText(overrideName)
    }

    // 5. Return to settings — selected voice should be unchanged
    await page.goto('/settings')
    const selectedAfter = page.locator('button[aria-current="true"]')

    await selectedAfter.waitFor()
    await expect(selectedAfter).toContainText(newVoiceName)
  })

  /** The chosen voice survives a full page reload. */
  test('selected voice persists across page refresh', async ({ page }) => {
    await mockTTS(page)

    // 1. Go to settings, select a different voice
    await page.goto('/settings')
    const newVoiceName = await selectDifferentVoice(page)

    // 2. Reload the page
    await page.reload()

    // 3. Verify the voice is still selected after refresh
    const selectedAfterRefresh = page.locator('button[aria-current="true"]')

    await selectedAfterRefresh.waitFor()
    await expect(selectedAfterRefresh).toContainText(newVoiceName)
  })
})
