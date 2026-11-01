import { statfs } from 'node:fs/promises';

export type AvailableSpaceProbe = (folder: string) => Promise<number>;

/** Bytes the current user may still write on the volume that holds `folder`. */
export async function availableBytes(folder: string): Promise<number> {
  const stats = await statfs(folder);
  return stats.bavail * stats.bsize;
}
