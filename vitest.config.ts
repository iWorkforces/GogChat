import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', 'scripts/**/*.test.js'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      // Exclude Playwright-dependent tests (use Playwright test runner instead)
      'tests/integration/**',
      'tests/e2e/**',
      'tests/performance/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/preload/**',
        'src/offline/**',
        'src/shared/types.ts',
        'src/shared/types/**',
        // Barrel re-exports (no runtime logic to cover)
        'src/**/index.ts',
        // Main process entry points / orchestrators (require full Electron environment)
        'src/main/index.ts',
        'src/main/windowWrapper.ts',
        'src/main/initializers/registerAppReady.ts',
        'src/main/initializers/shutdownDiagnostics.ts',
        // Complex features requiring extensive Electron mocking
        'src/main/features/appMenu.ts',
        'src/main/features/badgeIcon.ts',
        'src/main/features/externalLinks.ts',
        'src/main/features/inOnline.ts',
        'src/main/features/handleNotification.ts',
        'src/main/features/windowState.ts',
        'src/main/features/trayIcon.ts',
        'src/main/features/aboutPanel.ts',
        'src/main/features/openAtLogin.ts',
        'src/main/features/firstLaunch.ts',
        'src/main/features/userAgent.ts',
        'src/main/features/closeToTray.ts',
        'src/main/features/singleInstance.ts',
        'src/main/features/appUpdates.ts',
        'src/main/features/reportExceptions.ts',
        'src/main/features/cdpTelemetry.ts',
        // Files with 0% coverage due to V8 instrumentation limitations or pure types
        'src/environment.ts',
        'src/main/utils/lifecycle/cleanupTypes.ts',
        'src/main/utils/lifecycle/featureConfigTypes.ts',
        'src/main/utils/lifecycle/featureContextStore.ts',
        'src/main/utils/lifecycle/cdpMetrics.ts',
        // Thin glue / dual-path factories with extensive Electron surface area;
        // covered indirectly via ipcHelper and platform integration tests.
        'src/main/utils/ipc/defineIPC.ts',
        'src/main/utils/platform/trayIconState.ts',
        'src/shared/validators.ts',
      ],
      thresholds: {
        statements: 94,
        branches: 92,
        functions: 94,
        lines: 94,
      },
    },
  },
});
