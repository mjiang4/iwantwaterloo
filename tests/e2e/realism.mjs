import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
import {
  photographicFixture,
  fixtureCredit,
  fixtureKey,
} from '../helpers/photographic-fixture.mjs';
const site = await startTestSite();
const fixture = photographicFixture();
const browsers = [];
const openPicker = async (page) =>
  page.getByRole('button', { name: 'Choose realism or high fidelity' }).click();
async function installImagery(context, mode = 'success') {
  const requests = [];
  await context.route('**/park-provider.json', (route) =>
    route.fulfill({ json: { googleMapsKey: fixtureKey, elevation: 300 } }),
  );
  await context.route('https://tile.googleapis.com/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    // Every possible request to the paid service is intercepted. Never call Google.
    if (mode === 'failure')
      return route.fulfill({
        status: 403,
        json: { error: 'Fixture authorization failure' },
      });
    if (url.pathname.endsWith('root.json'))
      return route.fulfill({ json: fixture.root });
    assert.equal(url.searchParams.get('session'), 'fixture');
    assert.equal(url.searchParams.get('key'), fixtureKey);
    return route.fulfill({
      contentType: 'model/gltf-binary',
      body: fixture.glb,
    });
  });
  return requests;
}
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('.garden-canvas')?.getAttribute('data-quality') ===
        'realism' &&
      document.querySelector('.quality-toggle')?.getAttribute('aria-busy') ===
        'false',
    {},
    { timeout: 30000 },
  );
}
try {
  const chromiumBrowser = await chromium.launch();
  browsers.push(chromiumBrowser);
  const missing = await chromiumBrowser.newContext();
  await missing.route('**/park-provider.json', (route) =>
    route.fulfill({ json: { googleMapsKey: '' } }),
  );
  let unwanted = 0;
  await missing.route('https://tile.googleapis.com/**', (route) => {
    unwanted++;
    return route.abort();
  });
  const absent = await missing.newPage();
  await absent.goto(site.origin);
  await openPicker(absent);
  await absent.getByText('Realism isn’t connected yet.').waitFor();
  assert.equal(
    await absent
      .getByRole('button', { name: 'Enter realism', exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(unwanted, 0);
  await missing.close();
  console.log('PASS: missing provider fails closed without contacting Google');

  const safari = await webkit.launch();
  browsers.push(safari);
  for (const { browser, label, reducedMotion } of [
    {
      browser: chromiumBrowser,
      label: 'chromium',
      reducedMotion: 'no-preference',
    },
    { browser: safari, label: 'webkit', reducedMotion: 'reduce' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion,
    });
    const requests = await installImagery(context);
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(site.origin);
    await openPicker(page);
    await page.getByRole('button', { name: 'Keep it light' }).click();
    assert.equal(
      requests.length,
      0,
      'no imagery downloads until explicit opt-in',
    );
    await openPicker(page);
    await page
      .getByRole('button', { name: 'Enter realism', exact: true })
      .click();
    await ready(page);
    await page
      .getByRole('button', { name: 'Data sources', exact: true })
      .click();
    await page.getByText(fixtureCredit, { exact: true }).waitFor();
    assert.equal(
      await page.locator('[role="dialog"] b').count(),
      0,
      'attribution is text, never executable markup',
    );
    await page.keyboard.press('Escape');
    const rootRequests = requests.filter((url) =>
      url.pathname.endsWith('root.json'),
    ).length;
    await page.setViewportSize({ width: 844, height: 390 });
    await ready(page);
    await page.waitForTimeout(500);
    assert.equal(
      requests.filter((url) => url.pathname.endsWith('root.json')).length,
      rootRequests,
      'rotation keeps the existing imagery session',
    );
    const credit = await page.locator('.realism-credits').boundingBox();
    assert.ok(
      credit.x >= 0 &&
        credit.x + credit.width <= 844 &&
        credit.y >= 0 &&
        credit.y + credit.height <= 390,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('button', { name: 'Plant an idea', exact: true })
      .click();
    await page
      .locator('#new-idea')
      .fill(
        'Integration fixture: a quieter path through Waterloo Park ' + label,
      );
    await page.getByRole('button', { name: 'Post idea', exact: true }).click();
    await page.locator('.plant-receipt').waitFor({ timeout: 30000 });
    await ready(page);
    await page
      .locator('.plant-receipt')
      .getByRole('button', { name: 'Done', exact: true })
      .click();
    await page.locator('.garden-target').first().click();
    await ready(page);
    const support = page.locator('.garden-idea-dock .support-button');
    await support.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.garden-idea-dock .support-button')
          ?.getAttribute('aria-pressed') === 'true',
    );
    await page
      .locator('[data-celebrating]')
      .waitFor({ state: 'hidden', timeout: 30000 });
    const title = await page.locator('.garden-idea-dock').innerText();
    await page.screenshot({
      path:
        'outputs/browser-checks/' + label + '-realism-integration-fixture.jpg',
      quality: 70,
    });
    await page.getByRole('button', { name: 'Use light mode' }).click();
    assert.equal(
      await page.locator('.garden-canvas').getAttribute('data-quality'),
      'light',
    );
    assert.equal(await page.locator('.garden-idea-dock').innerText(), title);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      'PASS: ' +
        label +
        ' synthetic tiles align; credits, rotation, posting, likes and mode switching work',
    );
  }
  const denied = await chromiumBrowser.newContext({ reducedMotion: 'reduce' });
  await installImagery(denied, 'failure');
  const page = await denied.newPage();
  await page.goto(site.origin);
  await openPicker(page);
  await page
    .getByRole('button', { name: 'Enter realism', exact: true })
    .click();
  await page
    .getByText('Realism could not load. Light mode is still available.')
    .waitFor();
  assert.equal(
    await page.locator('.garden-canvas').getAttribute('data-quality'),
    'light',
  );
  await page.locator('.garden-target').first().waitFor();
  await denied.unroute('https://tile.googleapis.com/**');
  await installImagery(denied);
  await openPicker(page);
  await page
    .getByRole('button', { name: 'Enter realism', exact: true })
    .click();
  await ready(page);
  await denied.close();
  console.log('PASS: rejected imagery recovers to light mode and can retry');
} finally {
  for (const browser of browsers) await browser.close();
  await site.dispose();
}
