// Parses every AuctionModel XML file in the source folder into a flat JSON array
// of "question template" rows — one row per (template, testable position) slot,
// ready to insert into the question_templates table.
//
// Usage: node scripts/parseTemplates.mjs <path-to-folder-of-xml-files> [output.json]

import fs from 'node:fs';
import path from 'node:path';
import xml2js from 'xml2js';
import { seatForPosition } from '../src/lib/bidding.js';

const srcDir = process.argv[2];
const outFile = process.argv[3] || 'scripts/templates.json';

if (!srcDir) {
  console.error('Usage: node scripts/parseTemplates.mjs <path-to-xml-folder> [output.json]');
  process.exit(1);
}

const ROLE_KEYS = ['Opener', 'Responder', 'Overcaller', 'Advancer'];

function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseRole(roleNode) {
  const minHCP = Number(asArray(roleNode?.MinHCP)[0] ?? 0);
  const maxHCP = Number(asArray(roleNode?.MaxHCP)[0] ?? 0);
  const shapeNode = asArray(roleNode?.Shape)[0];
  const shapes = shapeNode ? asArray(shapeNode.string).map(String) : [];
  return { minHCP, maxHCP, shapes };
}

async function parseFile(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: true });
  const models = asArray(parsed.ArrayOfAuctionModel?.AuctionModel);

  return models.map((m) => {
    const name = asArray(m.Name)[0] || 'Hand';
    const bids = asArray(m.Bids?.[0]?.string).map(String);
    const testable = asArray(m.Testable?.[0]?.int).map(Number);
    const isConstructive = asArray(m.IsConstructive)[0] === 'true';
    const roles = {};
    ROLE_KEYS.forEach((role) => {
      roles[role] = parseRole(m[role]?.[0]);
    });
    return { name, bids, testable, isConstructive, roles };
  });
}

async function main() {
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.xml'));
  const rows = [];
  let templateCount = 0;

  for (const file of files) {
    const models = await parseFile(path.join(srcDir, file));

    models.forEach((m) => {
      templateCount += 1;
      m.testable.forEach((pos) => {
        const seat = seatForPosition(pos, m.isConstructive);
        const roleKey = { N: 'Opener', E: 'Overcaller', S: 'Responder', W: 'Advancer' }[seat];
        const role = m.roles[roleKey];

        rows.push({
          source_file: file,
          template_name: m.name,
          bids: m.bids,
          tested_position: pos,
          tested_seat: seat,
          is_constructive: m.isConstructive,
          min_hcp: role.minHCP,
          max_hcp: role.maxHCP,
          shapes: role.shapes,
        });
      });
    });
  }

  fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
  console.log(`Parsed ${files.length} files, ${templateCount} templates -> ${rows.length} question-template slots.`);
  console.log(`Written to ${outFile}`);
}

main();
