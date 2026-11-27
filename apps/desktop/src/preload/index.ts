import { contextBridge, ipcRenderer } from 'electron';
import type {
  VedraOpusApi,
  IpcArgs,
  IpcChannel,
  IpcEvent,
  IpcEvents,
  IpcResults,
} from '../shared/ipc';

function invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResults[C]> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResults[C]>;
}

function on<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void {
  const handler = (_: unknown, payload: IpcEvents[E]) => listener(payload);
  ipcRenderer.on(event, handler);
  return () => ipcRenderer.removeListener(event, handler);
}

const api: VedraOpusApi = {
  app: {
    getInfo: () => invoke('app:getInfo'),
    getLaunchPath: () => invoke('app:getLaunchPath'),
    thirdPartyNotices: () => invoke('app:thirdPartyNotices'),
    donate: () => invoke('app:donate'),
    sendFeedback: () => invoke('app:sendFeedback'),
    openNotice: (id) => invoke('app:openNotice', id),
    showMenu: (at) => invoke('app:showMenu', at),
    setTitleBarColours: (colours) => invoke('app:setTitleBarColours', colours),
  },
  project: {
    create: () => invoke('project:new'),
    open: () => invoke('project:open'),
    openPath: (path) => invoke('project:openPath', path),
    autosave: (projectJson) => invoke('project:autosave', projectJson),
    save: (projectJson) => invoke('project:save', projectJson),
    saveAs: (projectJson) => invoke('project:saveAs', projectJson),
    importAssets: () => invoke('project:importAssets'),
    importFiles: () => invoke('project:importFiles'),
    importWebFolder: () => invoke('project:importWebFolder'),
    storeRecording: (bytes) => invoke('project:storeRecording', bytes),
    storeScreenRecording: (bytes) => invoke('project:storeScreenRecording', bytes),
    importPowerPoint: () => invoke('project:importPowerPoint'),
    importStoryline: () => invoke('project:importStoryline'),
    openTranslation: () => invoke('project:openTranslation'),
    saveTranslation: (file) => invoke('project:saveTranslation', file),
    saveTranslationDocument: (file) => invoke('project:saveTranslationDocument', file),
    openCaptions: () => invoke('project:openCaptions'),
    saveCaptions: (files) => invoke('project:saveCaptions', files),
    listRecent: () => invoke('project:listRecent'),
    listRecoverable: () => invoke('project:listRecoverable'),
    recover: (workspaceId) => invoke('project:recover', workspaceId),
    discardRecovery: (workspaceId) => invoke('project:discardRecovery', workspaceId),
    openSlideSource: () => invoke('project:openSlideSource'),
    copySlideMedia: (hashes) => invoke('project:copySlideMedia', hashes),
    exportHandout: (request) => invoke('project:exportHandout', request),
    exportVideo: (request) => invoke('project:exportVideo', request),
    cancelVideo: () => invoke('project:cancelVideo'),
    exportHandoutDocument: (request) => invoke('project:exportHandoutDocument', request),
  },
  template: {
    list: () => invoke('template:list'),
    saveCurrent: (projectJson, name) => invoke('template:saveCurrent', projectJson, name),
    open: (path) => invoke('template:open', path),
    openDemo: () => invoke('template:openDemo'),
    remove: (path) => invoke('template:remove', path),
  },
  publish: {
    chooseFolder: () => invoke('publish:chooseFolder'),
    run: (request) => invoke('publish:run', request),
    lastFolder: (projectId) => invoke('publish:lastFolder', projectId),
    cancel: () => invoke('publish:cancel'),
    view: (published) => invoke('publish:view', published),
  },
  screen: {
    sources: () => invoke('screen:sources'),
    choose: (id) => invoke('screen:choose', id),
  },
  speech: {
    voices: () => invoke('speech:voices'),
    make: (request) => invoke('speech:make', request),
  },
  preview: {
    open: (request) => invoke('preview:open', request),
  },
  settings: {
    load: () => invoke('settings:load'),
    save: (settings) => invoke('settings:save', settings),
  },
  clipboard: {
    read: () => invoke('clipboard:read'),
    write: (text) => invoke('clipboard:write', text),
  },
  events: {
    onMenuCommand: (listener) => on('event:menuCommand', listener),
    onOpenRequest: (listener) => on('event:openRequest', listener),
    onPreviewEdit: (listener) => on('event:previewEdit', listener),
    onPublishProgress: (listener) => on('event:publishProgress', listener),
    onMediaProgress: (listener) => on('event:mediaProgress', listener),
    onVideoProgress: (listener) => on('event:videoProgress', listener),
    onImportProgress: (listener) => on('event:importProgress', listener),
  },
};

contextBridge.exposeInMainWorld('vedraopus', api);
