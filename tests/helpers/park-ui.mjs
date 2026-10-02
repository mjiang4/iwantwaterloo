// Shared steps for the park interface, so tests describe intent rather than layout.

/** The wordmark's verb ("i want / waterloo"): a chooser for "I love…" or "I want…". */
export function plantButton(page) {
  return page.getByRole('button', { name: /^Plant: i (want|love)…$/ });
}

/** Open the idea composer: Plant → "I want…". */
export async function plantIdea(page) {
  await plantButton(page).click();
  await page.getByRole('button', { name: /^I want…/ }).click();
}

/** Start placing a love: Plant → "I love…". */
export async function plantLove(page) {
  await plantButton(page).click();
  await page.getByRole('button', { name: /^I love…/ }).click();
}

/** Open the header menu and return it for scoped lookups. */
export async function openMenu(page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('navigation', { name: 'Site' });
  await menu.waitFor();
  return menu;
}

/**
 * Tap a tree and reveal its dock. On touch screens a tap opens the idea's full
 * sheet straight away (main's mobile behaviour); close it so the selected
 * tree's dock is in view.
 */
export async function openTreeDock(
  page,
  target = page.locator('.garden-target').first(),
) {
  await target.click();
  const sheet = page.locator('.idea-sheet');
  const opened = await sheet
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
  }
  await page.locator('.garden-idea-dock').waitFor();
}
