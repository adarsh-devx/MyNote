// Builds the React frontend for the production Tauri/Windows build.
//
// It loads .env.tauri (the desktop build environment, which sets the real
// production VITE_API_URL) before running `npm run build`, and refuses to
// produce a desktop bundle against http://localhost. The web build
// (`npm run build`) is unaffected and keeps its own Vite environment.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = resolve(root, '.env.tauri')

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2]
    }
  }
}

const apiUrl = process.env.VITE_API_URL
if (!apiUrl || /localhost|127\.0\.0\.1/i.test(apiUrl)) {
  console.error(
    '\n[tauri-frontend-build] Refusing to build the desktop frontend:',
    'VITE_API_URL is missing or points at localhost (' +
      String(apiUrl ?? '(unset)') +
      ').\n' +
      'Set the production API URL in client/.env.tauri (e.g. VITE_API_URL=https://your-api.example.com/api)\n' +
      'Local development is unaffected — it uses the Vite dev server fallback.\n',
  )
  process.exit(1)
}

console.log(`[tauri-frontend-build] Building frontend with VITE_API_URL=${apiUrl}`)
const result = spawnSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)