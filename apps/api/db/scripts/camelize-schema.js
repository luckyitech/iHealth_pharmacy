/**
 * Renames an introspected Prisma schema to JavaScript naming without touching the database names:
 *   - models and enums become PascalCase, and models get `@@map("legacy_table")`
 *   - fields become camelCase, and scalar fields get `@map("LEGACY_COLUMN")`
 *   - references inside `@relation`, `@@id`, `@@index` and `@@unique` follow the renames
 *
 * The script is deterministic and idempotent, so `npm run db:pull -w @ihealth/api` always yields the same file.
 *
 *   node scripts/camelize-schema.js prisma/schema.prisma
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BLOCK_START = /^(model|enum|view)\s+(\w+)\s*\{\s*$/;
const FIELD_LINE = /^(\s*)(\w+)(\s+)(\w+)(\[\]|\?)?(.*)$/;
const RELATION_SUFFIX = 'Relation';
const SCRATCH_PREFIX = '#';

/**
 * @param {string} name
 * @returns {string[]}
 */
function words(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/**
 * @param {string} name
 * @returns {string}
 */
export function toPascalCase(name) {
  const result = words(name)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
  return /^[0-9]/.test(result) ? `T${result}` : result;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function toCamelCase(name) {
  const pascal = toPascalCase(name);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isCamelCase(name) {
  return /^[a-z][A-Za-z0-9]*$/.test(name);
}

/**
 * @typedef {object} Block
 * @property {'model' | 'enum' | 'view'} kind
 * @property {string} name
 * @property {number} start Index of the opening line.
 * @property {number} end Index of the closing brace line.
 */

/**
 * @param {string[]} lines
 * @returns {Block[]}
 */
function findBlocks(lines) {
  /** @type {Block[]} */
  const blocks = [];
  lines.forEach((line, index) => {
    const match = BLOCK_START.exec(line);
    if (!match) return;
    const end = lines.findIndex((candidate, i) => i > index && /^\}\s*$/.test(candidate));
    blocks.push({
      kind: /** @type {Block['kind']} */ (match[1]),
      name: match[2],
      start: index,
      end,
    });
  });
  return blocks;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isFieldLine(line) {
  const trimmed = line.trim();
  return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('@@');
}

/**
 * Replaces field identifiers inside every `[...]` list that follows `key:` (or a bare `@@index([...])`).
 *
 * @param {string} text
 * @param {RegExp} listPattern
 * @param {Map<string, string>} fieldMap
 * @returns {string}
 */
function renameInLists(text, listPattern, fieldMap) {
  return text.replace(listPattern, (whole, prefix, list) => {
    const renamed = list.replace(
      /\b(\w+)\b(?!\s*:)/g,
      (/** @type {string} */ id) => fieldMap.get(id) ?? id,
    );
    return `${prefix}${renamed}]`;
  });
}

/**
 * @param {string} source
 * @returns {string}
 */
export function camelizeSchema(source) {
  const lines = source.split('\n');
  const blocks = findBlocks(lines);

  /** @type {Map<Block, string>} */
  const newNames = new Map(blocks.map((block) => [block, typeNameFor(block, lines)]));
  assertUnique([...newNames.values()], 'model/enum names');

  // Introspection can emit two models with the same name (`stock_qty_working` and the scratch table
  // `#stock_qty_working`). Relations only ever point at the regular table, so it owns the name.
  /** @type {Map<string, Block>} */
  const byName = new Map();
  for (const block of blocks) {
    if (!mappedTable(block, lines)?.startsWith(SCRATCH_PREFIX)) byName.set(block.name, block);
    else if (!byName.has(block.name)) byName.set(block.name, block);
  }
  const typeNames = new Map([...byName].map(([name, block]) => [name, newNames.get(block)]));
  const modelNames = new Set(
    blocks.filter((block) => block.kind !== 'enum').map((block) => block.name),
  );

  /** @type {Map<Block, Map<string, string>>} block -> (old field -> new field) */
  const fieldMaps = new Map();
  for (const block of blocks) {
    if (block.kind === 'enum') continue;
    /** @type {Map<string, string>} */
    const map = new Map();
    /** @type {string[]} */
    const relationFields = [];
    for (let i = block.start + 1; i < block.end; i += 1) {
      const match = isFieldLine(lines[i]) && FIELD_LINE.exec(lines[i]);
      if (!match) continue;
      if (modelNames.has(match[4])) relationFields.push(match[2]);
      else
        map.set(
          match[2],
          isCamelCase(match[2]) && /@map\(/.test(match[6]) ? match[2] : toCamelCase(match[2]),
        );
    }
    // A relation named after its model often collides with its own foreign-key column
    // (ACCOUNT_TYPE Int + account_type account_type): the column keeps the plain name.
    const scalarNames = new Set(map.values());
    for (const field of relationFields) {
      const camel = toCamelCase(field);
      map.set(field, scalarNames.has(camel) ? `${camel}${RELATION_SUFFIX}` : camel);
    }
    assertUnique([...map.values()], `fields of ${block.name}`);
    fieldMaps.set(block, map);
  }

  for (const block of blocks) {
    const fieldMap = fieldMaps.get(block) ?? new Map();
    const newName = /** @type {string} */ (newNames.get(block));
    lines[block.start] = `${block.kind} ${newName} {`;
    if (block.kind === 'enum') continue;

    let hasMap = false;
    for (let i = block.start + 1; i < block.end; i += 1) {
      const line = lines[i];
      if (line.trim().startsWith('@@map(')) hasMap = true;
      if (line.trim().startsWith('@@')) {
        lines[i] = renameInLists(
          line,
          /(@@(?:id|index|unique|fulltext)\(\s*(?:fields:\s*)?\[)([^\]]*)\]/g,
          fieldMap,
        );
        continue;
      }
      const match = isFieldLine(line) && FIELD_LINE.exec(line);
      if (!match) continue;

      const [, indent, field, gap, type, modifier = '', rest] = match;
      const relatedModel = modelNames.has(type) ? byName.get(type) : undefined;
      let attributes = rest;
      if (relatedModel) {
        const relatedMap = fieldMaps.get(relatedModel) ?? new Map();
        attributes = renameInLists(attributes, /(fields:\s*\[)([^\]]*)\]/g, fieldMap);
        attributes = renameInLists(attributes, /(references:\s*\[)([^\]]*)\]/g, relatedMap);
      } else if (!/@map\(/.test(attributes) && fieldMap.get(field) !== field) {
        attributes = attributes.replace(
          /^(\s*)(.*?)(\s*(?:\/\/.*)?)$/,
          (_whole, lead, body, comment) =>
            body ? `${lead}${body} @map("${field}")${comment}` : ` @map("${field}")${comment}`,
        );
      }
      lines[i] =
        `${indent}${fieldMap.get(field)}${gap}${typeNames.get(type) ?? type}${modifier}${attributes}`;
    }
    if (!hasMap && newName !== block.name) {
      lines.splice(block.end, 0, `  @@map("${block.name}")`);
      shiftBlocks(blocks, block.end);
    }
  }
  return lines.join('\n');
}

/**
 * @param {Block} block
 * @param {string[]} lines
 * @returns {string | undefined} The table name from an existing `@@map`, if any.
 */
function mappedTable(block, lines) {
  for (let i = block.start + 1; i < block.end; i += 1) {
    const match = /^\s*@@map\("([^"]+)"\)/.exec(lines[i]);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Names a model after its table (so a rerun on an already camelized schema is a no-op).
 * Legacy scratch tables whose names start with `#` get a `Temp` prefix.
 *
 * @param {Block} block
 * @param {string[]} lines
 * @returns {string}
 */
function typeNameFor(block, lines) {
  const table = block.kind === 'enum' ? undefined : mappedTable(block, lines);
  const source = table ? table.replace(new RegExp(`^${SCRATCH_PREFIX}`), 'temp_') : block.name;
  return toPascalCase(source);
}

/**
 * @param {Block[]} blocks
 * @param {number} insertedAt
 */
function shiftBlocks(blocks, insertedAt) {
  for (const block of blocks) {
    if (block.start >= insertedAt) block.start += 1;
    if (block.end >= insertedAt) block.end += 1;
  }
}

/**
 * @param {string[]} names
 * @param {string} what
 */
function assertUnique(names, what) {
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) throw new Error(`Renaming would create a duplicate in ${what}: ${name}`);
    seen.add(name);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/camelize-schema.js <schema.prisma>');
  writeFileSync(file, camelizeSchema(readFileSync(file, 'utf8')));
}
