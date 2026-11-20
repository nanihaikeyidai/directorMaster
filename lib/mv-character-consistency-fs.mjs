/**
 * Node-only helpers for character-consistency packs (directory listing).
 * Do not import this module from browser / MV page code.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CHARACTER_REF_IMAGE_RE } from './mv-character-consistency.mjs';

/**
 * List common image refs in a folder (non-recursive, sorted).
 * @param {string} dir
 * @returns {string[]}
 */
export function listCharacterRefPaths(dir) {
  if (!dir || !existsSync(dir)) return [];
  /** @type {string[]} */
  const found = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    if (CHARACTER_REF_IMAGE_RE.test(name)) found.push(full);
  }
  found.sort((a, b) => a.localeCompare(b));
  return found;
}
