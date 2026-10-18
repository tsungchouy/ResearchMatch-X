import { defineConfig, devices } from '@playwright/test'

const backend = '../backend'
const python = `${backend}/.venv/bin/python`
const reuse = !process.env.CI

/**
 * Two stacks run side by side:
 * - :5173 → backend :8000 with no OpenAI configuration (Demo + "not configured" tests)
 * - :5174 → backend :8001 pointed at a local OpenAI stub on :8765 (Live wiring tests)
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port 8000`,
      cwd: backend,
      url: 'http://localhost:8000/api/health',
      reuseExistingServer: reuse,
      env: { OPENAI_API_KEY: '', OPENAI_MODEL: '' },
    },
    {
      command: `.venv/bin/python -m uvicorn tests.stub_openai_server:app --port 8765`,
      cwd: backend,
      url: 'http://127.0.0.1:8765/docs',
      reuseExistingServer: reuse,
      env: { STUB_FAIL_DOMAINS: 'stanford.edu' },
    },
    {
      command: `.venv/bin/python -m uvicorn app.main:app --port 8001`,
      cwd: backend,
      url: 'http://localhost:8001/api/health',
      reuseExistingServer: reuse,
      env: { OPENAI_API_KEY: 'stub-key', OPENAI_MODEL: 'stub-model', OPENAI_BASE_URL: 'http://127.0.0.1:8765/v1' },
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: reuse,
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: reuse,
      env: { API_PROXY_TARGET: 'http://localhost:8001' },
    },
  ],
})
