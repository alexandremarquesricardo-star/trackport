import { app, Menu, type MenuItemConstructorOptions } from "electron";

/**
 * The user-facing app name. Hardcoded — we deliberately don't call
 * `app.setName("TrackPort")` because that would also rebase
 * `app.getPath("userData")` from `%APPDATA%/trackport` to
 * `%APPDATA%/TrackPort` and orphan every existing user's saved
 * preferences and library cache. The path key is forever lowercased;
 * the display name is forever properly cased.
 */
const APP_NAME = "TrackPort";

/**
 * Build the application menu. Mac always shows this in the system menu
 * bar; Windows / Linux hide it behind Alt because `autoHideMenuBar: true`
 * is the right default for a focused tool. Either way, we replace
 * Electron's default "Electron" menu with a TrackPort-named one — the
 * default looks unprofessional in production.
 *
 * Library actions (Add / Re-scan) deliberately stay out of the menu for
 * now: they're already one click away on the main surface and adding
 * them here would mean threading the LibraryStore through the menu
 * module just to fire IPC. Keep this module pure — only Electron
 * standard items + shell-level operations.
 */
export function buildAppMenu(): Menu {
  const isMac = process.platform === "darwin";
  const isDev = !app.isPackaged;

  const macAppMenu: MenuItemConstructorOptions = {
    label: APP_NAME,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "&File",
    submenu: [isMac ? { role: "close" } : { role: "quit" }],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "&Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? ([{ role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" }] as const)
        : ([{ role: "delete" }, { type: "separator" }, { role: "selectAll" }] as const)),
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "&View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      ...(isDev ? ([{ role: "toggleDevTools" }] as const) : []),
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "&Window",
    submenu: isMac
      ? [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" },
        ]
      : [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
  };

  // Mac surfaces About via the app menu, so the Help menu collapses to
  // nothing on Mac and we drop it entirely.
  const helpMenu: MenuItemConstructorOptions | null = isMac
    ? null
    : {
        label: "&Help",
        submenu: [
          {
            label: "About TrackPort",
            click: (): void => {
              app.showAboutPanel();
            },
          },
        ],
      };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    ...(helpMenu ? [helpMenu] : []),
  ];

  return Menu.buildFromTemplate(template);
}

/**
 * Configure the macOS About panel so it shows TrackPort's metadata
 * instead of the default Electron strings. Safe to call on any platform
 * — Electron no-ops it on Win/Linux.
 */
export function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: `Copyright © ${new Date().getFullYear()} ${APP_NAME}`,
  });
}
