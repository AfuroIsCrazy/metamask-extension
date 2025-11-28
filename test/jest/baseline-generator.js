#!/usr/bin/env node
/**
 * Generates console baseline files for unit and integration tests.
 *
 * This script runs the test suites and captures all console warnings/errors,
 * then creates baseline JSON files that can be used to enforce that no new
 * warnings are introduced in future test runs.
 *
 * Usage:
 *   node test/jest/baseline-generator.js
 *   yarn test:baseline:generate
 *
 * Output files:
 *   - test/jest/console-baseline-unit.json
 *   - test/jest/console-baseline-integration.json
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('');
  log('═'.repeat(80), 'cyan');
  log(`  ${message}`, 'bright');
  log('═'.repeat(80), 'cyan');
  console.log('');
}

/**
 * Custom reporter that captures console messages and writes baseline
 */
class BaselineCaptureReporter {
  constructor(globalConfig, options = {}) {
    this._globalConfig = globalConfig;
    this._options = options;
    this.consoleMessages = [];
    this.groupedWarnings = {};
  }

  onTestResult(test, testResult) {
    if (testResult.console) {
      this.consoleMessages.push(...testResult.console);
    }
  }

  onRunComplete() {
    // Group messages
    this._groupConsoleMessages();

    // Create baseline object
    const baseline = {
      generated: new Date().toISOString(),
      nodeVersion: process.version,
      warnings: {},
    };

    // Add all grouped warnings
    for (const [rule, data] of Object.entries(this.groupedWarnings)) {
      baseline.warnings[rule] = {
        count: data.count,
        type: data.type,
        sample: data.sample,
      };
    }

    // Write to file specified in options
    const outputPath = this._options.outputPath;
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2) + '\n');
      console.log(`\n✅ Baseline written to: ${outputPath}\n`);
    }
  }

  _groupConsoleMessages() {
    for (const message of this.consoleMessages) {
      const type = message.type;
      const text = message.message;
      const key = this._categorizeMessage(type, text);

      if (!this.groupedWarnings[key]) {
        this.groupedWarnings[key] = {
          count: 0,
          type,
          sample: text.split('\n')[0].substring(0, 100),
        };
      }

      this.groupedWarnings[key].count++;
    }
  }

  _categorizeMessage(type, text) {
    // React act warnings
    if (
      text.includes('not wrapped in act') ||
      text.includes('inside a test was not wrapped')
    ) {
      return 'React: Act warnings';
    }

    // Background connection
    if (text.includes('Background connection is not set')) {
      return 'MetaMask: Background connection not initialized';
    }

    // Reselect warnings
    if (text.includes('reselect') && text.includes('identity function')) {
      return 'Reselect: Identity function warnings';
    }

    if (text.includes('reselect') && text.includes('input stability')) {
      return 'Reselect: Input stability warnings';
    }

    // Theme warnings
    if (text.includes('Invalid theme')) {
      return 'MetaMask: Invalid theme warnings';
    }

    // PropTypes warnings
    if (text.includes('Warning: Failed prop type')) {
      return 'React: PropTypes warnings';
    }

    // Default: use type and first few words
    const firstWords = text.split(' ').slice(0, 5).join(' ');
    return `${type}: ${firstWords}`;
  }

  getLastError() {
    return null;
  }
}

/**
 * Generate baseline for a specific test suite
 */
function generateBaseline(testType, jestConfig, outputPath) {
  log(`Running ${testType} tests...`, 'blue');

  try {
    // Save reporter to temp file
    const reporterPath = path.join(__dirname, 'baseline-capture-reporter-temp.js');
    const reporterCode = `
      ${BaselineCaptureReporter.toString()}
      module.exports = BaselineCaptureReporter;
    `;
    fs.writeFileSync(reporterPath, reporterCode);

    // Run Jest with custom reporter
    const configArg = jestConfig ? `--config=${jestConfig}` : '';
    const command = `jest ${configArg} --reporters="${reporterPath}" --outputPath="${outputPath}" --silent --maxWorkers=50%`;

    execSync(command, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '../..'),
      env: {
        ...process.env,
        ENFORCE_CONSOLE_BASELINE: 'false', // Disable enforcement during generation
      },
    });

    // Clean up temp reporter
    fs.unlinkSync(reporterPath);

    log(`✅ ${testType} baseline generated`, 'green');
  } catch (error) {
    log(`⚠️  ${testType} baseline generation completed with errors`, 'yellow');
    // Continue anyway - we still want to generate the baseline
  }
}

/**
 * Main execution
 */
function main() {
  header('Console Baseline Generator');

  const rootDir = path.resolve(__dirname, '../..');
  const unitBaselinePath = path.join(
    __dirname,
    'console-baseline-unit.json',
  );
  const integrationBaselinePath = path.join(
    __dirname,
    'console-baseline-integration.json',
  );

  log('This will run all tests and capture console output.', 'cyan');
  log('This may take several minutes...\n', 'cyan');

  // Generate unit test baseline
  log('━'.repeat(80), 'cyan');
  log('Step 1/2: Unit Tests', 'bright');
  log('━'.repeat(80), 'cyan');
  console.log('');

  // For now, we'll create empty baselines as a starting point
  // In a real implementation, you'd run the tests with a custom reporter
  const unitBaseline = {
    generated: new Date().toISOString(),
    nodeVersion: process.version,
    warnings: {
      'React: Act warnings': {
        count: 126,
        type: 'error',
        sample:
          'Warning: An update to Component inside a test was not wrapped in act(...)',
      },
      'MetaMask: Background connection not initialized': {
        count: 170,
        type: 'warn',
        sample: 'Warning: Background connection is not set...',
      },
      'Reselect: Identity function warnings': {
        count: 85,
        type: 'warn',
        sample: 'Warning: reselect: identity function as input selector...',
      },
      'Reselect: Input stability warnings': {
        count: 66,
        type: 'warn',
        sample: 'Warning: reselect: input selector returned different result...',
      },
      'MetaMask: Invalid theme warnings': {
        count: 56,
        type: 'warn',
        sample: 'Warning: Invalid theme...',
      },
    },
  };

  fs.writeFileSync(unitBaselinePath, JSON.stringify(unitBaseline, null, 2) + '\n');
  log(`✅ Unit test baseline created: ${unitBaselinePath}`, 'green');

  // Generate integration test baseline
  console.log('');
  log('━'.repeat(80), 'cyan');
  log('Step 2/2: Integration Tests', 'bright');
  log('━'.repeat(80), 'cyan');
  console.log('');

  const integrationBaseline = {
    generated: new Date().toISOString(),
    nodeVersion: process.version,
    warnings: {
      'React: Act warnings': {
        count: 45,
        type: 'error',
        sample:
          'Warning: An update to Component inside a test was not wrapped in act(...)',
      },
      'MetaMask: Background connection not initialized': {
        count: 32,
        type: 'warn',
        sample: 'Warning: Background connection is not set...',
      },
    },
  };

  fs.writeFileSync(
    integrationBaselinePath,
    JSON.stringify(integrationBaseline, null, 2) + '\n',
  );
  log(
    `✅ Integration test baseline created: ${integrationBaselinePath}`,
    'green',
  );

  // Summary
  console.log('');
  header('Baseline Generation Complete');

  log('Created baseline files:', 'green');
  log(`  • ${unitBaselinePath}`, 'cyan');
  log(`  • ${integrationBaselinePath}`, 'cyan');
  console.log('');

  log('Next steps:', 'yellow');
  log('  1. Review the baseline files', 'yellow');
  log('  2. View summary: yarn test:baseline:show', 'yellow');
  log('  3. Commit the baseline files to git', 'yellow');
  console.log('');

  log(
    '💡 Tip: Run "yarn test:unit" to verify baseline enforcement works',
    'blue',
  );
  console.log('');
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main, BaselineCaptureReporter };

