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

const electronBuilderCli = fileURLToPath(new URL('../node_modules/electron-builder/cli.js', import.meta.url))
const env = withNodeOption(process.env, '--disable-warning=DEP0190')

const child = spawn(process.execPath, [electronBuilderCli, ...process.argv.slice(2)], {
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

