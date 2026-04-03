const args = new Set(process.argv.slice(2))

const signingOptions = [
  {
    label: 'Developer ID certificate',
    envNames: ['CSC_LINK', 'CSC_KEY_PASSWORD']
  },
  {
    label: 'Local keychain identity',
    envNames: ['CSC_NAME']
  }
]

const notarizationOptions = [
  {
    label: 'App Store Connect API key',
    envNames: ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
  },
  {
    label: 'Apple ID credentials',
    envNames: ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
  }
]

function readStatus(options) {
  for (const option of options) {
    const present = option.envNames.filter((name) => Boolean(process.env[name]?.trim()))
    if (present.length === option.envNames.length) {
      return {
        ok: true,
        label: option.label,
        missing: []
      }
    }

    if (present.length > 0) {
      return {
        ok: false,
        label: option.label,
        missing: option.envNames.filter((name) => !present.includes(name))
      }
    }
  }

  return {
    ok: false,
    label: null,
    missing: []
  }
}

function printSection(title, status, fallbackMessage) {
  console.log(`${title}:`)

  if (status.ok) {
    console.log(`- ready via ${status.label}`)
    return
  }

  if (status.label) {
    console.log(`- incomplete ${status.label}; missing ${status.missing.join(', ')}`)
    return
  }

  console.log(`- missing; ${fallbackMessage}`)
}

const signingStatus = readStatus(signingOptions)
const notarizationStatus = readStatus(notarizationOptions)
const requireSigning = args.has('--require-signing')
const requireNotarization = args.has('--require-notarization')

console.log('ForgetMe release environment check')
console.log('')
printSection(
  'Signing',
  signingStatus,
  'set CSC_LINK + CSC_KEY_PASSWORD, or provide CSC_NAME for a keychain-installed identity'
)
printSection(
  'Notarization',
  notarizationStatus,
  'set APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID'
)
console.log('')

const failures = []
if (requireSigning && !signingStatus.ok) {
  failures.push('signing credentials are required for a formal macOS release')
}
if (requireNotarization && !notarizationStatus.ok) {
  failures.push('notarization credentials are required for a formal macOS release')
}

if (failures.length > 0) {
  console.log('Release readiness: BLOCKED')
  for (const failure of failures) {
    console.log(`- ${failure}`)
  }
  process.exit(1)
}

if (signingStatus.ok && notarizationStatus.ok) {
  console.log('Release readiness: formal macOS release inputs detected')
} else {
  console.log('Release readiness: local packaging only; formal macOS release inputs are still incomplete')
}
