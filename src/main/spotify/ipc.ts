/**
 * IPC handlers for the Spotify auth controller. Renderer talks to this
 * surface only — it never touches Spotify, the token store, or the
 * callback server directly.
 */

import { BrowserWindow, ipcMain } from "electron";
import type { SpotifyAuthState } from "../../shared/spotify";
import type { SpotifyAuthController } from "./auth-controller";

export const SPOTIFY_AUTH_GET_STATE = "spotify-auth:get-state";
export const SPOTIFY_AUTH_CONNECT = "spotify-auth:connect";
export const SPOTIFY_AUTH_DISCONNECT = "spotify-auth:disconnect";
/** Push channel — main emits, renderer listens. */
export const SPOTIFY_AUTH_STATE_EVENT = "spotify-auth:state";

export function registerSpotifyAuthHandlers(controller: SpotifyAuthController): void {
  ipcMain.handle(SPOTIFY_AUTH_GET_STATE, (): SpotifyAuthState => controller.publicState());
  ipcMain.handle(SPOTIFY_AUTH_CONNECT, (): Promise<SpotifyAuthState> => controller.connect());
  ipcMain.handle(SPOTIFY_AUTH_DISCONNECT, async (): Promise<void> => {
    await controller.disconnect();
  });
}

/**
 * Broadcast state changes to every open window. Keeps the renderer UI in
 * sync without polling, and survives the user opening/closing windows
 * mid-flow.
 */
export function bindSpotifyAuthEvents(controller: SpotifyAuthController): () => void {
  const onChange = (state: SpotifyAuthState): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(SPOTIFY_AUTH_STATE_EVENT, state);
      }
    }
  };
  controller.on("change", onChange);
  return () => controller.off("change", onChange);
}
