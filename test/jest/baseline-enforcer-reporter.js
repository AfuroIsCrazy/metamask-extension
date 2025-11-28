/**
 * Jest reporter that enforces a console baseline.
 *
 * This reporter prevents new console warnings/errors from being introduced
 * by comparing the current test run's console output against a saved baseline.
 *
 * Features:
 * - Fails tests if new warnings appear or counts increase
 * - Shows improvements when warnings are fixed
 * - Can be temporarily disabled with ENFORCE_CONSOLE_BASELINE=false
 *
 * Usage in jest.config.js:
 * {
 *   reporters: [
 *     ['<rootDir>/test/jest/baseline-enforcer-reporter.js', {
 *       baselinePath: '<rootDir>/test/jest/console-baseline-unit.json',
 *       enabled: process.env.ENFORCE_CONSOLE_BASELINE !== 'false',
 *     }]
 *   ]
 * }
 */

const fs = require('fs');
const path = require('path');

class BaselineEnforcerReporter {
  constructor(globalConfig, options = {}) {
    this._globalConfig = globalConfig;
    this._options = {
      baselinePath: options.baselinePath,
      enabled: options.enabled !== false,
      failOnViolation: options.failOnViolation !== false,
      showImprovements: options.showImprovements !== false,
      threshold: options.threshold || 0, // Allow threshold for lenient mode
    };

    // Load baseline
    this.baseline = this._loadBaseline();

    // Track console messages during test run
    this.consoleMessages = [];
    this.groupedWarnings = {};
    this.violations = [];
    this.improvements = [];
  }

  /**
   * Load the baseline JSON file
   */
  _loadBaseline() {
    if (!this._options.baselinePath) {
      return { warnings: {} };
    }

    const baselinePath = path.resolve(
      this._globalConfig.rootDir,
      this._options.baselinePath.replace('<rootDir>/', ''),
    );

    try {
      if (!fs.existsSync(baselinePath)) {
        console.warn(
          `\n⚠️  Baseline file not found: ${baselinePath}\n` +
            `   Run "yarn test:baseline:generate" to create it.\n`,
        );
        return { warnings: {} };
      }

      const content = fs.readFileSync(baselinePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`\n❌ Failed to load baseline: ${error.message}\n`);
      return { warnings: {} };
    }
  }

  /**
   * Called when a test starts
   *
   * @param _test - Test information (unused)
   */
  onTestStart(_test) {
    // No-op for now
  }

  /**
   * Called after each test completes
   *
   * @param _test - Test information (unused)
   * @param testResult - Test result containing console messages
   */
  onTestResult(_test, testResult) {
    // Collect console messages from this test
    if (testResult.console) {
      this.consoleMessages.push(...testResult.console);
    }
  }

  /**
   * Called when all tests complete
   *
   * @param _contexts - Test contexts (unused)
   * @param results - Test results
   */
  onRunComplete(_contexts, results) {
    if (!this._options.enabled) {
      console.log('\n⚠️  Console baseline enforcement is DISABLED\n');
      return;
    }

    // Group console messages by pattern (similar to jest-clean-console-reporter)
    this._groupConsoleMessages();

    // Compare against baseline
    this._compareWithBaseline();

    // Print results
    this._printResults();

    // Fail if violations found
    if (this._options.failOnViolation && this.violations.length > 0) {
      results.success = false;
      // Note: We can't throw here as it would crash Jest
      // Instead, we set success to false and Jest will exit with non-zero code
    }
  }

  /**
   * Group console messages by type and pattern
   */
  _groupConsoleMessages() {
    for (const message of this.consoleMessages) {
      const { type, message: text } = message; // 'log', 'warn', 'error', etc.

      // Create a simple key from the message
      // In a real implementation, you'd want to use the same rules
      // as jest-clean-console-reporter for consistency
      const key = this._categorizeMessage(type, text);

      if (!this.groupedWarnings[key]) {
        this.groupedWarnings[key] = {
          count: 0,
          type,
          sample: text.split('\n')[0].substring(0, 100),
        };
      }

      this.groupedWarnings[key].count += 1;
    }
  }

  /**
   * Categorize a console message into a rule category
   * This is a simplified version - ideally would reuse rules from jest-clean-console-reporter
   *
   * @param type - Console message type (log, warn, error, etc.)
   * @param text - Console message text
   * @returns Category key for this message
   */
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

    // Default: use type and first few words
    const firstWords = text.split(' ').slice(0, 5).join(' ');
    return `${type}: ${firstWords}`;
  }

  /**
   * Compare current warnings with baseline
   */
  _compareWithBaseline() {
    const baselineWarnings = this.baseline.warnings || {};

    // Check for violations (increased counts or new warnings)
    for (const [rule, data] of Object.entries(this.groupedWarnings)) {
      const baselineCount = baselineWarnings[rule]?.count || 0;
      const { count: currentCount } = data;
      const { threshold } = this._options;

      if (currentCount > baselineCount + threshold) {
        this.violations.push({
          rule,
          baseline: baselineCount,
          current: currentCount,
          increase: currentCount - baselineCount,
          isNew: baselineCount === 0,
        });
      } else if (currentCount < baselineCount) {
        this.improvements.push({
          rule,
          baseline: baselineCount,
          current: currentCount,
          decrease: baselineCount - currentCount,
        });
      }
    }

    // Check for warnings that disappeared completely
    for (const [rule, { count: baselineCount }] of Object.entries(
      baselineWarnings,
    )) {
      if (!this.groupedWarnings[rule]) {
        this.improvements.push({
          rule,
          baseline: baselineCount,
          current: 0,
          decrease: baselineCount,
          fixed: true,
        });
      }
    }
  }

  /**
   * Print comparison results
   */
  _printResults() {
    const hasViolations = this.violations.length > 0;
    const hasImprovements =
      this._options.showImprovements && this.improvements.length > 0;
    const isClean = !hasViolations && !hasImprovements;

    if (isClean) {
      console.log('\n✅ Console baseline matches exactly!\n');
      return;
    }

    console.log('\n');
    console.log('═'.repeat(80));
    console.log('  Console Baseline Enforcement Report');
    console.log('═'.repeat(80));

    if (hasViolations) {
      console.log('\n❌ BASELINE VIOLATIONS DETECTED\n');
      console.log(
        '  The following console warnings have increased or are new:\n',
      );

      for (const violation of this.violations) {
        if (violation.isNew) {
          console.log(`  🆕 NEW: ${violation.rule}`);
          console.log(`     Current: ${violation.current} occurrences`);
        } else {
          console.log(`  ⬆️  ${violation.rule}`);
          console.log(
            `     Baseline: ${violation.baseline}, Current: ${violation.current} (+${violation.increase})`,
          );
        }
        console.log('');
      }

      console.log('  💡 Next steps:');
      console.log('     1. Fix the warnings in your code, OR');
      console.log(
        '     2. Update baseline: yarn test:baseline:update (requires justification)\n',
      );
    }

    if (hasImprovements) {
      console.log('\n✨ CONSOLE IMPROVEMENTS DETECTED\n');
      console.log('  Great job! The following warnings were reduced:\n');

      for (const improvement of this.improvements) {
        if (improvement.fixed) {
          console.log(`  🎉 FIXED: ${improvement.rule}`);
          console.log(
            `     All ${improvement.baseline} occurrences eliminated!`,
          );
        } else {
          console.log(`  ⬇️  ${improvement.rule}`);
          console.log(
            `     Baseline: ${improvement.baseline}, Current: ${improvement.current} (-${improvement.decrease})`,
          );
        }
        console.log('');
      }

      console.log('  💡 Lock in improvements:');
      console.log('     yarn test:baseline:update\n');
    }

    console.log('═'.repeat(80));
    console.log('\n');
  }

  /**
   * Required by Jest reporter interface
   *
   * @returns Always returns null
   */
  getLastError() {
    return null;
  }
}

module.exports = BaselineEnforcerReporter;
