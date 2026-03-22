import type { ReactElement, ReactNode } from 'react'
import { render as rtlRender, type RenderOptions } from '@testing-library/react'
import { I18nProvider } from '../../../src/renderer/i18n'

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'>

export function render(ui: ReactElement, options?: CustomRenderOptions) {
  function Wrapper(props: { children: ReactNode }) {
    return <I18nProvider>{props.children}</I18nProvider>
  }

  return rtlRender(ui, { wrapper: Wrapper, ...options })
}

export * from '@testing-library/react'
