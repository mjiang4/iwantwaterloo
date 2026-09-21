import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
const site = await startTestSite();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(site.origin);
  await page
    .getByRole('button', { name: 'Plant an idea', exact: true })
    .click();
  await page
    .locator('#new-idea')
    .fill('A shaded walking path beside Waterloo library.');
  await page.getByRole('button', { name: 'Post idea', exact: true }).click();
  await page.locator('[data-celebrating="plant"]').waitFor();
  await page.locator('[data-celebrating="plant"]').waitFor({ state: 'hidden' });
  await page
    .locator('.plant-receipt')
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  await page.locator('.garden-target').first().click();
  await page.locator('.garden-idea-dock .support-button').click();
  await page.locator('[data-celebrating="like"]').waitFor();
  await page.locator('[data-celebrating="like"]').waitFor({ state: 'hidden' });
  assert.equal(
    await page
      .locator('.garden-idea-dock .support-button')
      .getAttribute('aria-pressed'),
    'true',
  );
  await page.getByRole('button', { name: 'Deselect tree' }).click();
  await page.getByRole('button', { name: 'Browse idea themes' }).click();
  await page
    .locator('.park-theme-menu')
    .getByRole('button', { name: 'Moving', exact: true })
    .click();
  assert.equal(await page.locator('.park-empty-lens').count(), 0);
  await page.getByRole('button', { name: 'Browse idea themes' }).click();
  await page
    .locator('.park-theme-menu')
    .getByRole('button', { name: 'Homes', exact: true })
    .click();
  await page.locator('.park-empty-lens').waitFor();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('tab', { name: /^Ideas/ }).click();
  await page.getByRole('tab', { name: 'Garden', exact: true }).click();
  await page.getByRole('link', { name: 'GitHub', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Make a pull request' })
    .waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    'PASS: animated planting and like growth complete; touch theme browsing and contribution entry work',
  );

  const fallback = await browser.newContext();
  await fallback.route('**/park/waterloo-park.glb', (route) => route.abort());
  const fallbackPage = await fallback.newPage();
  await fallbackPage.goto(site.origin);
  await fallbackPage
    .getByRole('button', { name: 'View ideas', exact: true })
    .click();
  await fallbackPage.locator('#new-idea').waitFor();
  assert.equal(
    await fallbackPage
      .getByRole('tab', { name: /^Ideas/ })
      .getAttribute('aria-selected'),
    'true',
  );
  await fallback.close();
  console.log(
    'PASS: failed 3D asset loading leaves the complete idea interface usable',
  );
} finally {
  await browser.close();
  await site.dispose();
}
