import type { ReactElement, ReactNode } from 'react'
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { act } from 'react'
import { I18nProvider } from '../../../src/renderer/i18n'

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'>

export function render(ui: ReactElement, options?: CustomRenderOptions) {
  function Wrapper(props: { children: ReactNode }) {
    return <I18nProvider>{props.children}</I18nProvider>
  }

  return rtlRender(ui, { wrapper: Wrapper, ...options })
}

export { act, cleanup, fireEvent, screen, waitFor, within }
