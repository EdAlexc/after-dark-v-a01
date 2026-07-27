/**
 * Pure helpers for the migration runner — no I/O, unit-testable.
 */

/** Valid migration filename: NNNN_snake_name.sql */
export const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

export function isValidMigrationName(name) {
  return MIGRATION_NAME.test(name);
}

/**
 * @param {string[]} available filenames found in migrations/
 * @param {string[]} applied names already recorded in _migrations
 * @returns {string[]} pending names, sorted by numeric prefix
 * @throws when a filename is invalid or an applied migration file disappeared
 */
export function selectPending(available, applied) {
  const invalid = available.filter((name) => !isValidMigrationName(name));
  if (invalid.length > 0) {
    throw new Error(`Invalid migration filename(s): ${invalid.join(', ')}`);
  }

  const availableSet = new Set(available);
  const missing = applied.filter((name) => !availableSet.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Applied migration(s) missing from migrations/: ${missing.join(', ')} — never delete applied migrations`
    );
  }

  const appliedSet = new Set(applied);
  return available
    .filter((name) => !appliedSet.has(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
