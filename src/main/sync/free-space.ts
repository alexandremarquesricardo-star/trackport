import { statfs } from "node:fs/promises";

/**
 * Free space available to a non-privileged user on the volume that hosts
 * `mountPath`. Uses the POSIX statfs convention (bavail × bsize). On
 * Windows, Node.js implements statfs against the underlying volume so this
 * works for drive letters like `E:\` and for `\\?\Volume{...}\` paths alike.
 */
export async function getFreeBytes(mountPath: string): Promise<number> {
  const s = await statfs(mountPath);
  return Number(s.bsize) * Number(s.bavail);
}
