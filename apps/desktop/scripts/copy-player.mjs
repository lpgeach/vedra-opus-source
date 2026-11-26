// Puts the built course player where the app finds it (`out/player`), so the
// packaged app can publish courses without the repository around it.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const from = join(root, '../../packages/player/dist');
const to = join(root, 'out/player');

if (!existsSync(join(from, 'player.js'))) {
  throw new Error('packages/player has not been built: run "npm run build -w @vedraopus/player".');
}
mkdirSync(to, { recursive: true });
// With the list of npm packages built into the player, for published courses' notices.
for (const name of ['player.js', 'player.css', 'third-party-notices.json']) {
  cpSync(join(from, name), join(to, name));
}
