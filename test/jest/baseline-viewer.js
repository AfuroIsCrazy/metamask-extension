#!/usr/bin/env node
/**
 * Pretty-prints the current console baseline files.
 *
 * Usage:
 *   node test/jest/baseline-viewer.js
 *   yarn test:baseline:show
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function color(text, colorName) {
  return `${colors[colorName]}${text}${colors.reset}`;
}

function loadBaseline(filename) {
  const filePath = path.join(__dirname, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(color(`Failed to load ${filename}: ${error.message}`, 'red'));
    return null;
  }
}

function formatDate(isoString) {
  if (!isoString) {
    return 'Unknown';
  }
  const date = new Date(isoString);
  return date.toLocaleString();
}

function printBaseline(title, baseline) {
  if (!baseline) {
    console.log(color(`\n${title} baseline not found`, 'red'));
    return;
  }

  console.log('');
  console.log(color('═'.repeat(80), 'cyan'));
  console.log(color(`  ${title}`, 'bright'));
  console.log(color('═'.repeat(80), 'cyan'));
  console.log('');

  // Metadata
  console.log(color('  Metadata:', 'dim'));
  console.log(
    color(`    Generated: ${formatDate(baseline.generated)}`, 'dim'),
  );
  console.log(color(`    Node Version: ${baseline.nodeVersion || 'N/A'}`, 'dim'));
  console.log('');

  // Warnings table
  const warnings = baseline.warnings || {};
  const entries = Object.entries(warnings);

  if (entries.length === 0) {
    console.log(color('  No warnings in baseline (clean!)', 'green'));
    console.log('');
    return;
  }

  // Sort by count (descending)
  entries.sort((a, b) => b[1].count - a[1].count);

  // Calculate total
  const total = entries.reduce((sum, [, data]) => sum + data.count, 0);

  // Print table header
  console.log(
    color('  COUNT  TYPE   CATEGORY', 'dim'),
  );
  console.log(color('  ' + '─'.repeat(76), 'dim'));

  // Print each warning
  for (const [rule, data] of entries) {
    const countStr = data.count.toString().padStart(6);
    const typeStr = data.type.toUpperCase().padEnd(6);

    // Color code by type
    let typeColor = 'reset';
    if (data.type === 'error') {
      typeColor = 'red';
    } else if (data.type === 'warn') {
      typeColor = 'yellow';
    }

    console.log(
      `  ${color(countStr, 'bright')}  ${color(typeStr, typeColor)}  ${rule}`,
    );
  }

  // Print total
  console.log(color('  ' + '─'.repeat(76), 'dim'));
  console.log(`  ${color(total.toString().padStart(6), 'bright')}  ${color('TOTAL', 'cyan')}`);
  console.log('');
}

function main() {
  console.log('');
  console.log(color('═'.repeat(80), 'cyan'));
  console.log(color('  Console Baseline Summary', 'bright'));
  console.log(color('═'.repeat(80), 'cyan'));

  // Load baselines
  const unitBaseline = loadBaseline('console-baseline-unit.json');
  const integrationBaseline = loadBaseline('console-baseline-integration.json');

  // Print unit baseline
  printBaseline('Unit Tests', unitBaseline);

  // Print integration baseline
  printBaseline('Integration Tests', integrationBaseline);

  // Calculate grand total
  const unitTotal = unitBaseline
    ? Object.values(unitBaseline.warnings || {}).reduce(
        (sum, data) => sum + data.count,
        0,
      )
    : 0;
  const integrationTotal = integrationBaseline
    ? Object.values(integrationBaseline.warnings || {}).reduce(
        (sum, data) => sum + data.count,
        0,
      )
    : 0;
  const grandTotal = unitTotal + integrationTotal;

  // Print grand total
  console.log(color('═'.repeat(80), 'cyan'));
  console.log(
    `  ${color('GRAND TOTAL:', 'bright')} ${color(grandTotal.toString(), 'bright')} console messages`,
  );
  console.log(color('═'.repeat(80), 'cyan'));
  console.log('');

  // Tips
  if (grandTotal > 0) {
    console.log(color('💡 Tips:', 'yellow'));
    console.log(color('  • Work on reducing these warnings over time', 'yellow'));
    console.log(
      color('  • After fixing warnings, run: yarn test:baseline:update', 'yellow'),
    );
    console.log(
      color(
        '  • Baseline enforcement prevents new warnings from being added',
        'yellow',
      ),
    );
    console.log('');
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };

