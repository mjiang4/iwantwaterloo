import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('outputs/browser-checks', { recursive: true });
import { startTestSite } from '../helpers/test-site.mjs';
const site = await startTestSite();
const browser = await chromium.launch();
async function checkQuality(page, requests, label) {
  assert.equal(
    requests.length,
    0,
    'detail and decoder must not load by default',
  );
  await page.getByRole('button', { name: 'Try high fidelity' }).click();
  await page.getByText(/more graphics power and battery/).waitFor();
  await page.getByRole('button', { name: 'Keep it light' }).click();
  assert.equal(requests.length, 0, 'dismissing the warning downloads nothing');
  await page.getByRole('button', { name: 'Try high fidelity' }).click();
  await page
    .getByRole('button', { name: 'Load high fidelity', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('.quality-toggle')?.getAttribute('aria-busy') ===
        'false' &&
      document.querySelector('.garden-canvas')?.getAttribute('data-quality') ===
        'high',
    {},
    { timeout: 60000 },
  );
  assert.ok(requests.some((url) => url.endsWith('waterloo-park-detail.glb')));
  assert.ok(requests.some((url) => url.includes('/draco/')));
  await page.locator('.garden-target').first().waitFor();
  await page
    .getByRole('button', { name: 'Preview daylight', exact: true })
    .click();
  await page.screenshot({
    path: 'outputs/browser-checks/' + label + '-high-detail.jpg',
    quality: 75,
  });
  await page.locator('.garden-target').first().click();
  await page.locator('.garden-idea-dock').waitFor();
  const support = page.locator('.garden-idea-dock .support-button');
  if ((await support.getAttribute('aria-pressed')) === 'true') {
    await support.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.garden-idea-dock .support-button')
          ?.getAttribute('aria-pressed') === 'false',
    );
  }
  await support.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('.garden-idea-dock .support-button')
        ?.getAttribute('aria-pressed') === 'true',
  );
  await page
    .locator('.garden-stage[data-celebrating]')
    .waitFor({ state: 'hidden', timeout: 30000 });
  const title = await page.locator('.garden-idea-dock').innerText();
  await page.getByRole('button', { name: 'Use light mode' }).click();
  assert.equal(
    await page.locator('.garden-canvas').getAttribute('data-quality'),
    'light',
  );
  assert.equal(
    await page.locator('.garden-idea-dock').innerText(),
    title,
    'mode switches preserve the selected idea',
  );
  await page.getByRole('button', { name: 'Deselect tree' }).click();
}
function watchDetail(page) {
  const requests = [];
  page.on('request', (r) => {
    if (/waterloo-park-detail\.glb|\/draco\//.test(r.url()))
      requests.push(r.url());
  });
  return requests;
}
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  const detailRequests = watchDetail(page);
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
  await checkQuality(page, detailRequests, 'chromium-mobile');
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

  const safari = await webkit.launch();
  try {
    const mobile = await safari.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const p = await mobile.newPage();
    const requests = watchDetail(p);
    p.on('pageerror', (error) => errors.push(error.message));
    p.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await p.goto(site.origin);
    await p
      .getByRole('button', { name: 'Explore an idea', exact: true })
      .click();
    await p.locator('.garden-target.selected').waitFor({ timeout: 30000 });
    const target = await p.locator('.garden-target.selected').boundingBox();
    assert.ok(
      target.x >= 0 &&
        target.x + target.width <= 390 &&
        target.y > 200 &&
        target.y < 600,
      'intro frames a tappable idea',
    );
    await p.getByRole('button', { name: 'Deselect tree' }).click();
    await checkQuality(p, requests, 'webkit-mobile');
    await p.setViewportSize({ width: 844, height: 390 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await mobile.close();
  } finally {
    await safari.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: detail is opt-in, warning cancellation stays light, mobile Chromium/WebKit load detail and preserve selection',
  );

  const brokenDetail = await browser.newContext({ reducedMotion: 'reduce' });
  await brokenDetail.route('**/park/waterloo-park-detail.glb', (route) =>
    route.abort(),
  );
  const p = await brokenDetail.newPage();
  await p.goto(site.origin);
  await p.getByRole('button', { name: 'Skip introduction' }).click();
  await p.locator('.garden-target').first().waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: 'Try high fidelity' }).click();
  await p
    .getByRole('button', { name: 'Load high fidelity', exact: true })
    .click();
  await p
    .getByText('Detail could not load. Light mode is still available.')
    .waitFor();
  assert.equal(
    await p.locator('.garden-canvas').getAttribute('data-quality'),
    'light',
  );
  await p.locator('.garden-target').first().click();
  await p.locator('.garden-idea-dock').waitFor();
  await brokenDetail.unroute('**/park/waterloo-park-detail.glb');
  await p.getByRole('button', { name: 'Try high fidelity' }).click();
  await p
    .getByRole('button', { name: 'Load high fidelity', exact: true })
    .click();
  await p.waitForFunction(
    () =>
      document.querySelector('.quality-toggle')?.getAttribute('aria-busy') ===
        'false' &&
      document.querySelector('.garden-canvas')?.getAttribute('data-quality') ===
        'high',
    {},
    { timeout: 60000 },
  );
  await p.locator('.garden-idea-dock').waitFor();
  await brokenDetail.close();
  console.log(
    'PASS: failed detail keeps the base park usable and a retry recovers without losing the idea',
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
