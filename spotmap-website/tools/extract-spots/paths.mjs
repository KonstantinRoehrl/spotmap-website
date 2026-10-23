/**
 * The app's data folders, shared by the extraction (tools/extract-spots) and the Supabase tools
 * (tools/sync-supabase). Every path is absolute, resolved from this file, so a tool behaves the
 * same from any working directory.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The app directory, spotmap-website/. */
export const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Where the extraction writes each city's lossless dataset, report and photos. */
export const SPOTS_DIR = join(APP_ROOT, 'data', 'spots');
/**
 * Where the app loads each city's bundled snapshot from, as `spots/<city>.geojson`
 * (base-relative). Written only by `npm run snapshot:supabase`, from the database.
 */
export const PUBLIC_SPOTS_DIR = join(APP_ROOT, 'public', 'spots');
