/**
 * Fails when application code contains values that belong in the database or in configuration:
 * place and pharmacy names, currencies, dialling codes, time zones, locales, hosts and URLs, account or
 * till numbers.
 *
 *   node scripts/quality/check-hardcodes.js
 *
 * Allowed: the validated config schema (its defaults are the one place for them), tests and fixtures,
 * comments, and lines marked `hardcode-ok: <reason>`. Run by `npm run check` and in CI.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIRS = ['apps/api/src', 'apps/web/src', 'packages/shared/src', 'apps/api/db/src'];
const ALLOWED_FILES = new Set(['apps/api/src/config/env.js']);
const IGNORED = /(^|\/)(node_modules|dist|test|__tests__)\/|\.test\.jsx?$|\.spec\.jsx?$/;
const MARKER = 'hardcode-ok:';

const RULES = [
  { name: 'place name', pattern: /\b(Nairobi|Mombasa|Kisumu|Nakuru|Eldoret|Kenya)\b/ },
  { name: 'pharmacy name', pattern: /DOCPHARMA|Docpharm/i },
  { name: 'currency code', pattern: /['"`](KES|USD|EUR|UGX|TZS)['"`]/ },
  { name: 'country dialling code', pattern: /\+(254|255|256|250)\b/ },
  {
    name: 'time zone',
    pattern: /['"`](Africa|Europe|America|Asia)\/[A-Za-z_]+['"`]|['"`][+-]\d{2}:\d{2}['"`]/,
  },
  { name: 'locale', pattern: /['"`][a-z]{2}-[A-Z]{2}['"`]/ },
  { name: 'host or URL', pattern: /localhost|127\.0\.0\.1|https?:\/\/(?!(www\.)?w3\.org)/ },
  {
    name: 'till or account number',
    pattern: /\b(till|paybill|account)(No|Number|_NO)?\s*[:=]\s*['"`]?\d{4,}/i,
  },
];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * @param {string} line
 * @returns {boolean}
 */
const isComment = (line) => /^\s*(\/\/|\/?\*|\{\/\*)/.test(line);

const findings = [];
for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.join(repoRoot, dir))) {
    const relative = path.relative(repoRoot, file);
    if (!/\.(js|jsx)$/.test(file) || IGNORED.test(relative) || ALLOWED_FILES.has(relative))
      continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (isComment(line) || line.includes(MARKER)) return;
        for (const rule of RULES) {
          if (rule.pattern.test(line))
            findings.push(`${relative}:${index + 1}  ${rule.name}: ${line.trim()}`);
        }
      });
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Hardcoded values found. Move them to the database, the config schema, or a named constant\n` +
      `(mark a deliberate exception with "// ${MARKER} <reason>"):\n\n${findings.join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write('No hardcoded values found.\n');
