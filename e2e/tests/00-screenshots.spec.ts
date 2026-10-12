import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DEMO, env, loginAs, signOut } from './support';

const dir = path.resolve(__dirname, '../.artifacts/screenshots');
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

test.beforeAll(() => fs.mkdirSync(dir, { recursive: true }));

for (const [name, size] of Object.entries(viewports)) {
  test.describe(`visual @ ${name}`, () => {
    test.use({ viewport: size });

    test('public pages', async ({ page }) => {
      for (const [slug, url] of [['login', '/login'], ['register-hostel', '/register/hostel'], ['register-join', '/register/join']] as const) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(dir, `${name}-${slug}.png`), fullPage: false });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(overflow, `${slug} horizontally overflows`).toBe(false);
      }
    });

    test('role dashboards', async ({ page }) => {
      const shots: [string, string, string, RegExp][] = [
        ['platform', env.platformEmail, env.platformPassword, /\/platform$/],
        ['hostel', DEMO.hostelAdmin, env.demoPassword, /\/hostel$/],
        ['assistant', DEMO.assistant, env.demoPassword, /\/assistant$/],
        ['student', DEMO.student, env.demoPassword, /\/student$/],
      ];
      for (const [slug, email, password, url] of shots) {
        await loginAs(page, email, password, url);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800); // chart animation
        await page.screenshot({ path: path.join(dir, `${name}-${slug}-dashboard.png`), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(overflow, `${slug} dashboard horizontally overflows`).toBe(false);
        if (name === 'desktop') await signOut(page);
        else await page.context().clearCookies();
      }
    });
  });
}
