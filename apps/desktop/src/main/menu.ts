import { app, Menu, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { IpcEvents } from '../shared/ipc';
import type { UpdateChannel } from '../shared/settings';
import { t } from '../shared/strings';
import { describeSystem, DONATE_URL, feedbackUrl } from './feedback';
import { PUBLIC_REPOSITORY } from './third-party';

const isMac = process.platform === 'darwin';

/**
 * Application menu. Items with a `click` are carried out by the renderer.
 * Items with `enabled: false` are placeholders whose commands arrive with
 * later work packages (editing commands in P2.2, insert in P2.3+, publish in
 * P3.5). `CmdOrCtrl` gives each platform its own modifier.
 */
/** The Help menu's crash report items (P11.5 part C), carried out by main. */
export interface CrashReportMenu {
  keepCrashReports: boolean;
  setKeepCrashReports(keep: boolean): void;
  showCrashReports(): void;
}

/** The Help menu's update items (P11.4 part B), carried out by main. */
export interface UpdateMenu {
  automatic: boolean;
  channel: UpdateChannel;
  checkNow(): void;
  setAutomatic(on: boolean): void;
  setChannel(channel: UpdateChannel): void;
}

export function buildApplicationMenu(
  onCommand: (command: IpcEvents['event:menuCommand']) => void,
  crashReports?: CrashReportMenu,
  updates?: UpdateMenu,
): Menu {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.file.new'), accelerator: 'CmdOrCtrl+N', click: () => onCommand('new') },
        { label: t('menu.file.open'), accelerator: 'CmdOrCtrl+O', click: () => onCommand('open') },
        {
          id: 'file.newFromTemplate',
          label: t('menu.file.newFromTemplate'),
          click: () => onCommand('newFromTemplate'),
        },
        { type: 'separator' },
        { label: t('menu.file.save'), accelerator: 'CmdOrCtrl+S', click: () => onCommand('save') },
        {
          id: 'file.saveAs',
          label: t('menu.file.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => onCommand('saveAs'),
        },
        {
          id: 'file.saveAsTemplate',
          label: t('menu.file.saveAsTemplate'),
          click: () => onCommand('saveAsTemplate'),
        },
        { type: 'separator' },
        {
          id: 'file.importSlides',
          label: t('menu.file.importSlides'),
          click: () => onCommand('importSlides'),
        },
        {
          id: 'file.importPowerPoint',
          label: t('menu.file.importPowerPoint'),
          click: () => onCommand('importPowerPoint'),
        },
        {
          id: 'file.importStoryline',
          label: t('menu.file.importStoryline'),
          click: () => onCommand('importStoryline'),
        },
        {
          id: 'file.exportHandout',
          label: t('menu.file.exportHandout'),
          click: () => onCommand('exportHandout'),
        },
        {
          id: 'file.exportVideo',
          label: t('menu.file.exportVideo'),
          click: () => onCommand('exportVideo'),
        },
        {
          id: 'file.translation',
          label: t('menu.file.translation'),
          click: () => onCommand('translation'),
        },
        {
          id: 'file.publish',
          label: t('menu.file.publish'),
          accelerator: 'F10',
          click: () => onCommand('publish'),
        },
        {
          id: 'file.preview',
          label: t('menu.file.preview'),
          accelerator: 'F12',
          click: () => onCommand('preview'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        // Not the built-in roles: those only undo typing in a text field. The
        // renderer decides between that and the document's own history.
        {
          id: 'edit.undo',
          label: t('menu.edit.undo'),
          accelerator: 'CmdOrCtrl+Z',
          click: () => onCommand('undo'),
        },
        {
          id: 'edit.redo',
          label: t('menu.edit.redo'),
          accelerator: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y',
          click: () => onCommand('redo'),
        },
        { type: 'separator' },
        // Also not roles: the renderer cuts and copies objects on the stage,
        // and hands the work to the browser when a text field has focus.
        {
          id: 'edit.cut',
          label: t('menu.edit.cut'),
          accelerator: 'CmdOrCtrl+X',
          click: () => onCommand('cut'),
        },
        {
          id: 'edit.copy',
          label: t('menu.edit.copy'),
          accelerator: 'CmdOrCtrl+C',
          click: () => onCommand('copy'),
        },
        {
          id: 'edit.paste',
          label: t('menu.edit.paste'),
          accelerator: 'CmdOrCtrl+V',
          click: () => onCommand('paste'),
        },
        {
          id: 'edit.duplicate',
          label: t('menu.edit.duplicate'),
          accelerator: 'CmdOrCtrl+D',
          click: () => onCommand('duplicate'),
        },
        { id: 'edit.delete', label: t('menu.edit.delete'), click: () => onCommand('delete') },
        { type: 'separator' },
        {
          id: 'edit.selectAll',
          label: t('menu.edit.selectAll'),
          accelerator: 'CmdOrCtrl+A',
          click: () => onCommand('selectAll'),
        },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          id: 'view.overview',
          label: t('menu.view.overview'),
          accelerator: 'CmdOrCtrl+1',
          click: () => onCommand('overview'),
        },
        {
          id: 'view.slide',
          label: t('menu.view.slide'),
          accelerator: 'CmdOrCtrl+2',
          click: () => onCommand('slideView'),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: t('menu.insert'),
      submenu: [
        {
          id: 'insert.newSlide',
          label: t('menu.insert.newSlide'),
          accelerator: 'CmdOrCtrl+M',
          click: () => onCommand('newSlide'),
        },
        { type: 'separator' },
        {
          id: 'insert.textBox',
          label: t('menu.insert.textBox'),
          click: () => onCommand('insertTextBox'),
        },
        {
          id: 'insert.shape',
          label: t('menu.insert.shape'),
          click: () => onCommand('insertShape'),
        },
        {
          id: 'insert.picture',
          label: t('menu.insert.picture'),
          click: () => onCommand('insertPicture'),
        },
        {
          id: 'insert.button',
          label: t('menu.insert.button'),
          click: () => onCommand('insertButton'),
        },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          id: 'help.sendFeedback',
          label: t('menu.help.sendFeedback'),
          click: () =>
            void shell.openExternal(
              feedbackUrl(
                app.getVersion(),
                describeSystem(process.platform, process.getSystemVersion()),
              ),
            ),
        },
        {
          id: 'help.donate',
          label: t('menu.help.donate'),
          click: () => void shell.openExternal(DONATE_URL),
        },
        { type: 'separator' },
        {
          label: t('menu.help.repository'),
          click: () => void shell.openExternal(PUBLIC_REPOSITORY),
        },
        {
          id: 'help.demo',
          label: t('menu.help.demo'),
          click: () => onCommand('openDemo'),
        },
        {
          id: 'help.thirdPartyNotices',
          label: t('menu.help.thirdPartyNotices'),
          click: () => onCommand('thirdPartyNotices'),
        },
        ...(updates
          ? [
              { type: 'separator' as const },
              {
                id: 'help.checkForUpdates',
                label: t('menu.help.checkForUpdates'),
                click: () => updates.checkNow(),
              },
              {
                id: 'help.updatesAutomatic',
                label: t('menu.help.updatesAutomatic'),
                type: 'checkbox' as const,
                checked: updates.automatic,
                click: (item: { checked: boolean }) => updates.setAutomatic(item.checked),
              },
              {
                label: t('menu.help.updateChannel'),
                submenu: [
                  {
                    id: 'help.channel.stable',
                    label: t('menu.help.channelStable'),
                    type: 'radio' as const,
                    checked: updates.channel === 'stable',
                    click: () => updates.setChannel('stable'),
                  },
                  {
                    id: 'help.channel.beta',
                    label: t('menu.help.channelBeta'),
                    type: 'radio' as const,
                    checked: updates.channel === 'beta',
                    click: () => updates.setChannel('beta'),
                  },
                ],
              },
            ]
          : []),
        ...(crashReports
          ? [
              { type: 'separator' as const },
              {
                id: 'help.keepCrashReports',
                label: t('menu.help.keepCrashReports'),
                type: 'checkbox' as const,
                checked: crashReports.keepCrashReports,
                click: (item: { checked: boolean }) =>
                  crashReports.setKeepCrashReports(item.checked),
              },
              {
                id: 'help.showCrashReports',
                label: t('menu.help.showCrashReports'),
                click: () => crashReports.showCrashReports(),
              },
            ]
          : []),
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}
