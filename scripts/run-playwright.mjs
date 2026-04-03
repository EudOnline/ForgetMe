import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const playwrightCli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url))
const args = ['test', ...process.argv.slice(2)]
const env = { ...process.env }

// Playwright can force colored output in child workers; removing NO_COLOR avoids the
// conflicting env warning without affecting app/runtime behavior.
delete env.NO_COLOR

const child = spawn(process.execPath, [playwrightCli, ...args], {
  stdio: 'inherit',
  env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

