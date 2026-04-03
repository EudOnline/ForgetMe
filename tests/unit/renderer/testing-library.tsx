import type { ReactElement, ReactNode } from 'react'
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { act } from 'react'
import { I18nProvider } from '../../../src/renderer/i18n'

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'>

function createStorageMock() {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    }
  }
}

const localStorageMock = createStorageMock()

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true
  })
}

export function render(ui: ReactElement, options?: CustomRenderOptions) {
  function Wrapper(props: { children: ReactNode }) {
    return <I18nProvider>{props.children}</I18nProvider>
  }

  return rtlRender(ui, { wrapper: Wrapper, ...options })
}

function cleanupWithStorageReset() {
  localStorageMock.clear()
  cleanup()
}

export { act, cleanupWithStorageReset as cleanup, fireEvent, screen, waitFor, within }
