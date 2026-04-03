import type { AppShellAction } from './navigation'
import type { AppShellState } from './routeState'

export function createInitialAppShellState(): AppShellState {
  return {
    route: { kind: 'import' }
  }
}

export function reduceAppShellState(state: AppShellState, action: AppShellAction): AppShellState {
  switch (action.type) {
    case 'route/navigate':
      return {
        ...state,
        route: action.route
      }
  }
}
