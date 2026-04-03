import type { IpcRenderer } from 'electron'

export function invokeWith<I, O>(ipcRenderer: IpcRenderer, channel: string) {
  return (input: I) => ipcRenderer.invoke(channel, input) as Promise<O>
}

export function invokeWithout<O>(ipcRenderer: IpcRenderer, channel: string) {
  return () => ipcRenderer.invoke(channel) as Promise<O>
}
