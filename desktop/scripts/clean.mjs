import { rmSync } from 'node:fs';

for (const directory of ['dist', 'dist-dev', 'release']) {
  rmSync(directory, { recursive: true, force: true });
}
