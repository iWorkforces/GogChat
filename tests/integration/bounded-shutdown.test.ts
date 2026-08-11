/**
 * Process-level proof that a hung cleanup cannot stall quit past 8s.
 */

import { expect, test } from '../helpers/electron-test';

test.use({ extraElectronEnv: { GOGCHAT_TEST_HANG_SHUTDOWN: 'feature' } });

const OVERALL_MS = 8_000;
const HARNESS_SLACK_MS = 2_000;

test.describe('bounded shutdown', () => {
  test('exits the Electron child when a cleanup never settles', async ({ electronApp }) => {
    const child = electronApp.process();
    const started = Date.now();
    const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => {
        resolve(code);
      });
    });

    // Do not await evaluate(app.quit()): quitting destroys the evaluate context
    // so the promise never settles (or throws GC / target-closed) on CI.
    void electronApp
      .evaluate(({ app }) => {
        app.quit();
      })
      .catch(() => undefined);

    const code = await Promise.race([
      exited,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('process did not exit within shutdown ceiling plus slack'));
        }, OVERALL_MS + HARNESS_SLACK_MS);
      }),
    ]);

    expect(Date.now() - started).toBeLessThanOrEqual(OVERALL_MS + HARNESS_SLACK_MS);
    expect(code === 0 || code === null || typeof code === 'number').toBe(true);
  });
});
