import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function withNodeOption(env, option) {
  const currentValue = env.NODE_OPTIONS?.trim() ?? ''
  if (currentValue.includes(option)) {
    return env
  }

  return {
    ...env,
    NODE_OPTIONS: currentValue ? `${currentValue} ${option}` : option
  }
}

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const args = ['run', ...process.argv.slice(2)]
const env = withNodeOption(process.env, '--disable-warning=ExperimentalWarning')

const child = spawn(process.execPath, [vitestCli, ...args], {
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

