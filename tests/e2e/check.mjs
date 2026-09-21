import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';

const artifacts = path.resolve('outputs/browser-checks');
await mkdir(artifacts, { recursive: true });
console.log('Starting a compiled site with a disposable database…');
const site = await startTestSite();
let browser;
let activePage;
const errors = [];
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(site.origin);
  await page.getByRole('tab', { name: 'Garden', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('tab', { name: 'Garden', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  await page.locator('.garden-welcome').waitFor();
  assert.equal(await page.locator('#new-idea').isVisible(), false);
  await page.locator('.scene canvas').waitFor();
  await page.screenshot({
    path: path.join(artifacts, 'desktop-park.jpg'),
    quality: 65,
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Skip introduction', exact: true })
    .click();
  await page.reload();
  await page
    .getByRole('button', { name: 'Plant an idea', exact: true })
    .waitFor();
  assert.equal(await page.locator('.garden-welcome').count(), 0);
  assert.equal(
    await page
      .getByRole('link', { name: 'GitHub', exact: true })
      .getAttribute('href'),
    'https://github.com/mjiang4/iwantwaterloo',
  );
  await page.getByRole('button', { name: 'Help build this park' }).click();
  const contribute = page.getByRole('link', { name: 'Make a pull request' });
  assert.equal(
    await contribute.getAttribute('href'),
    'https://github.com/mjiang4/iwantwaterloo',
  );
  // Exercise the local reward without navigating to an external service.
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, body: 'Contribution test' }),
  );
  await contribute.click();
  await page
    .getByText('Thanks for helping it grow.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  console.log(
    'PASS: park landing, dismissible introduction, and contribution links',
  );

  await page
    .getByRole('button', { name: 'Plant an idea', exact: true })
    .click();
  await page
    .locator('#new-idea')
    .fill('A covered seating area near Waterloo library for rainy days.');
  await page.locator('#idea-signature').fill('Alex, 19, student');
  const savedResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/ideas') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Post idea', exact: true }).click();
  const saved = await (await savedResponse).json();
  assert.ok(saved.idea?.id, JSON.stringify(saved));
  const ideaId = saved.idea.id;
  await page.locator('.plant-receipt').waitFor();
  assert.equal(
    await page
      .getByRole('tab', { name: 'Garden', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  const mine = await (
    await context.request.get(site.origin + '/api/ideas?mine=1')
  ).json();
  assert.equal(mine.ideas[0].id, ideaId);
  console.log('PASS: posting reveals the garden and retains browser ownership');

  await page.getByRole('tab', { name: /^Ideas/ }).click();
  await page.route('**/api/comments?**', (route) => route.abort());
  await page.locator('.idea-open').first().click();
  await page.locator('.discussion-error').waitFor();
  assert.equal(
    await page
      .getByText('Add a detail or ask a question.', { exact: true })
      .count(),
    0,
  );
  await page
    .getByRole('textbox', { name: 'Your reply', exact: true })
    .fill('Could we start with a small shelter by the west entrance?');
  await page.unroute('**/api/comments?**');
  await page
    .locator('.discussion-error')
    .getByRole('button', { name: 'Retry' })
    .click();
  await page
    .getByText('Add a detail or ask a question.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.idea-open').first().click();
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Your reply', exact: true })
      .inputValue(),
    'Could we start with a small shelter by the west entrance?',
  );

  const keys = [];
  let dropped = false;
  await page.route('**/api/comments', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().postDataJSON().submissionKey);
    if (!dropped) {
      dropped = true;
      await route.fetch(); // The actual application commits before its response is lost.
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Add reply', exact: true }).click();
  await page
    .locator('.discussion-message')
    .filter({ hasText: /Couldn’t connect|connection timed out/ })
    .waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Add reply', exact: true }).click();
  await page
    .getByText('Your reply joined the conversation.', { exact: true })
    .waitFor();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  const replies = await (
    await context.request.get(site.origin + '/api/comments?ideaId=' + ideaId)
  ).json();
  assert.equal(replies.comments.length, 1);
  console.log(
    'PASS: discussion failures are visible, drafts survive closing, and lost-response retry stores one reply',
  );

  await page.locator('.detail-actions .support-button').click();
  await page.getByRole('tab', { name: 'Garden', exact: true }).waitFor();
  await page.locator('.idea-sheet').waitFor({ state: 'hidden' });
  const liked = await (
    await context.request.get(site.origin + '/api/ideas?id=' + ideaId)
  ).json();
  assert.equal(liked.ideas[0].waters, 1);
  await page.screenshot({
    path: path.join(artifacts, 'desktop-grown-tree.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Filter ideas', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sort ideas', exact: true }).click();
  await page.getByRole('option', { name: 'Most liked', exact: true }).click();
  await page
    .locator('.filter-popover')
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.locator('.garden-welcome').waitFor();
  console.log(
    'PASS: liking persists and returns to the tree; sorting remains in Filter',
  );

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
    '200% text enlargement must not cause horizontal overflow',
  );
  await page.screenshot({
    path: path.join(artifacts, 'desktop-large-text.png'),
    fullPage: true,
  });
  await context.close();
  await browser.close();
  browser = null;

  const engines = (
    process.env.WATERLOO_TEST_BROWSERS || 'chromium,webkit'
  ).split(',');
  for (const engine of engines) {
    if (!['chromium', 'webkit'].includes(engine))
      throw new Error('Unsupported browser ' + engine);
    browser = await { chromium, webkit }[engine].launch();
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await mobile.newPage();
    activePage = page;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(site.origin);
    await page
      .getByRole('button', { name: 'Plant an idea', exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.locator('.scene canvas').waitFor();
    await page.screenshot({
      path: path.join(artifacts, engine + '-mobile-park.jpg'),
      quality: 65,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Plant an idea', exact: true })
      .click();
    await page
      .locator('#new-idea')
      .fill('More shaded seating near Waterloo bus stops.');
    await page.locator('#idea-signature').fill('Jamie, lifelong resident');
    assert.ok(
      (await page
        .locator('#new-idea')
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 16,
    );
    await page.screenshot({
      path: path.join(artifacts, engine + '-mobile-compose.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Post idea', exact: true }).click();
    await page.locator('.plant-receipt').waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.getByRole('tab', { name: /^Ideas/ }).click();
    await page.locator('.idea-open').first().click();
    const replyField = page.getByRole('textbox', {
      name: 'Your reply',
      exact: true,
    });
    await replyField.waitFor();
    assert.ok(
      (await replyField.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      )) >= 16,
    );
    assert.ok(
      (await page
        .locator('.reply-footer input')
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 16,
    );
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await mobile.close();
    await browser.close();
    browser = null;
    console.log('PASS: ' + engine + ' mobile layout and submission');
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(
    'PASS: browser checks complete; screenshots in outputs/browser-checks',
  );
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage
      .screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true })
      .catch(() => {});
    console.error(
      'Discussion at failure:',
      await activePage
        .locator('.discussion')
        .innerText()
        .catch(() => 'not open'),
    );
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await site.dispose();
}
