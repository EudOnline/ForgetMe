import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('forgetme', {
  appName: 'ForgetMe'
})
