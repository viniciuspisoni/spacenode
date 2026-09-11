const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');

const folder = path.join(__dirname, 'social-selling');
const content = fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8');
const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
assert(frontmatter, 'Missing YAML frontmatter');
const metadata = yaml.load(frontmatter[1]);
assert.equal(metadata.name, 'social-selling');
assert.equal(typeof metadata.description, 'string');
assert(metadata.description.length > 0 && metadata.description.length <= 1024);
assert(!/[<>]/.test(metadata.description));
assert(Object.keys(metadata).every(key => ['name', 'description', 'metadata'].includes(key)));
assert(!content.includes('[TODO:'), 'Unfinished scaffold');
const links = [...content.matchAll(/\]\((\.\.\/[^)]+)\)/g)].map(match => match[1]);
assert.equal(links.length, 4, 'Unexpected local reference inventory');
for (const link of links) {
  assert(fs.statSync(path.resolve(folder, link)).isFile(), 'Missing reference: ' + link);
}
console.log('Validated YAML, metadata, finished content and all four local document links.');
