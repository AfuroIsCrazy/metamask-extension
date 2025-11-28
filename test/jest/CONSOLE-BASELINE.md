# Console Baseline Enforcement

## Overview

The console baseline enforcement system prevents new console warnings and errors from being introduced into the codebase while allowing you to work on fixing existing ones incrementally.

## How It Works

1. **Baseline Snapshot**: A JSON file contains exact counts of all current console warnings/errors
2. **Automatic Comparison**: Tests automatically compare their console output against the baseline
3. **Fail on Regression**: Tests fail if new warnings appear or counts increase
4. **Track Improvements**: System shows when warnings are reduced or eliminated

## Quick Start

### Running Tests (with enforcement enabled)

```bash
# Unit tests - enforces baseline by default
yarn test:unit

# Integration tests - enforces baseline by default
yarn test:integration
```

### Running Tests (without enforcement)

Useful when working on fixes that temporarily increase warnings:

```bash
# Unit tests without baseline enforcement
yarn test:unit:nobaseline

# Integration tests without baseline enforcement
yarn test:integration:nobaseline
```

### Viewing Current Baseline

```bash
# Shows a formatted summary of current baseline
yarn test:baseline:show
```

### Updating the Baseline

After fixing warnings or when you need to accept new warnings:

```bash
# Regenerates baseline files and stages them for git
yarn test:baseline:update
```

## Workflow Examples

### Example 1: Working on Feature (No New Warnings)

```bash
# 1. Implement your feature
# ... write code ...

# 2. Run tests
yarn test:unit

# Output:
# ✅ Console baseline matches exactly!
# All tests passed

# 3. Commit your changes
git commit -m "feat: add new feature"
```

### Example 2: Fixing Existing Warnings

```bash
# 1. Fix some warnings
# ... fix code ...

# 2. Run tests
yarn test:unit

# Output:
# ✨ CONSOLE IMPROVEMENTS DETECTED
#   ⬇️  React: Act warnings
#      Baseline: 126, Current: 76 (-50)
# 💡 Lock in improvements: yarn test:baseline:update

# 3. Update baseline to lock in improvements
yarn test:baseline:update

# 4. Commit both code and baseline
git add .
git commit -m "fix: reduce React act warnings by 50"
```

### Example 3: PR Introduces New Warnings (CI Failure)

```bash
# Developer opens PR with changes
# CI runs tests...

# Output:
# ❌ BASELINE VIOLATIONS DETECTED
#   ⬆️  React: Act warnings
#      Baseline: 126, Current: 151 (+25)
# 💡 Next steps:
#    1. Fix the warnings in your code, OR
#    2. Update baseline: yarn test:baseline:update (requires justification)

# Tests fail - PR cannot be merged until fixed
```

### Example 4: Intentionally Adding Warnings (With Justification)

```bash
# 1. You're refactoring and temporarily adding warnings
yarn test:unit:nobaseline  # Work without enforcement

# 2. When ready to update baseline
yarn test:baseline:update

# 3. Commit with justification in message
git commit -m "refactor: restructure components

This refactor temporarily increases React act warnings by 15.
These will be addressed in follow-up PR #12345.

Baseline updated to reflect current state."
```

## Baseline Files

The system maintains two baseline files:

### `test/jest/console-baseline-unit.json`

Contains baseline for unit tests. Example structure:

```json
{
  "generated": "2025-11-28T10:30:00Z",
  "nodeVersion": "v24.0.0",
  "warnings": {
    "React: Act warnings": {
      "count": 126,
      "type": "error",
      "sample": "Warning: An update to Component inside a test was not wrapped in act(...)"
    },
    "MetaMask: Background connection not initialized": {
      "count": 170,
      "type": "warn",
      "sample": "Warning: Background connection is not set..."
    }
  }
}
```

### `test/jest/console-baseline-integration.json`

Contains baseline for integration tests. Same structure as unit baseline.

## Configuration

### Enforcement Configuration (jest.config.js)

```javascript
reporters: [
  // ... other reporters ...
  [
    '<rootDir>/test/jest/baseline-enforcer-reporter.js',
    {
      baselinePath: '<rootDir>/test/jest/console-baseline-unit.json',
      enabled: process.env.ENFORCE_CONSOLE_BASELINE !== 'false',
      failOnViolation: true,
      showImprovements: true,
    },
  ],
],
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable enforcement |
| `failOnViolation` | `true` | Fail tests when baseline is violated |
| `showImprovements` | `true` | Show when warnings are reduced |
| `threshold` | `0` | Allow this many additional warnings per rule |

### Disabling Enforcement

Temporarily disable enforcement:

```bash
# Single test run
ENFORCE_CONSOLE_BASELINE=false yarn test:unit

# Or use the convenience script
yarn test:unit:nobaseline
```

Disable in configuration (not recommended for CI):

```javascript
{
  enabled: process.env.CI !== 'true',  // Disable in CI
}
```

## CI Integration

### GitHub Actions Example

```yaml
- name: Run unit tests with baseline enforcement
  run: yarn test:unit
  # Will fail if console baseline is violated

- name: Check if baseline was modified
  run: |
    if git diff --name-only | grep -q "console-baseline"; then
      echo "⚠️ Console baseline was modified!"
      echo "Verify this change is intentional and justified in the PR."
    fi
```

### Pre-commit Hook Example

```bash
#!/bin/bash
# .husky/pre-commit

# Run tests with baseline enforcement
yarn test:unit --silent

if [ $? -ne 0 ]; then
  echo "❌ Tests failed - baseline violations detected"
  echo "Fix warnings or run 'yarn test:baseline:update' to update baseline"
  exit 1
fi
```

## Troubleshooting

### Issue: Baseline file not found

**Error:**
```
⚠️  Baseline file not found: test/jest/console-baseline-unit.json
   Run "yarn test:baseline:generate" to create it.
```

**Solution:**
```bash
yarn test:baseline:generate
```

### Issue: Tests fail with violations

**Error:**
```
❌ BASELINE VIOLATIONS DETECTED
  ⬆️  React: Act warnings
     Baseline: 126, Current: 151 (+25)
```

**Solution Options:**

1. **Fix the warnings** (preferred):
   ```bash
   # Fix the code that causes warnings
   # Then run tests again
   yarn test:unit
   ```

2. **Disable temporarily** while fixing:
   ```bash
   yarn test:unit:nobaseline
   ```

3. **Update baseline** (requires justification):
   ```bash
   yarn test:baseline:update
   git commit -m "chore: update console baseline

   Reason: [explain why warnings increased]"
   ```

### Issue: Baseline shows improvements but tests still pass

This is expected! The system shows improvements to encourage you to lock them in:

```bash
# Lock in the improvements
yarn test:baseline:update
```

### Issue: Different developers see different baselines

Ensure all developers:
- Use same Node version (check `nodeVersion` in baseline file)
- Have pulled latest baseline files from git
- Run tests from project root

## Best Practices

### 1. Don't Commit Baseline Increases Without Justification

❌ **Bad:**
```bash
# Just update baseline without explanation
yarn test:baseline:update
git commit -m "update baseline"
```

✅ **Good:**
```bash
# Update with clear justification
yarn test:baseline:update
git commit -m "test: update console baseline for new feature

The new data fetching hooks introduce 10 additional React act warnings.
These are expected due to async state updates and will be addressed
in follow-up PR #12345 as part of the testing refactor."
```

### 2. Fix Warnings Incrementally

❌ **Bad:**
```bash
# Try to fix all 500 warnings at once
```

✅ **Good:**
```bash
# Fix 10-20 warnings at a time
# Update baseline after each batch
# Track progress over multiple PRs
```

### 3. Use Nobaseline Mode for Exploratory Work

❌ **Bad:**
```bash
# Keep updating baseline while exploring different approaches
```

✅ **Good:**
```bash
# Disable enforcement while exploring
yarn test:unit:nobaseline

# Re-enable when you've settled on an approach
yarn test:unit
```

### 4. Review Baseline Changes in PRs

When reviewing PRs that update the baseline:

- ✅ Check that baseline increase is justified in commit message
- ✅ Verify the increase is proportional to changes made
- ✅ Ask if warnings can be fixed instead of accepting them
- ✅ Ensure there's a plan to address new warnings

## Advanced Usage

### Lenient Mode (Allow Small Increases)

```javascript
// jest.config.js
{
  threshold: 5,  // Allow up to 5 additional warnings per rule
}
```

### Warning Only Mode (Don't Fail Tests)

```javascript
// jest.config.js
{
  failOnViolation: false,  // Show violations but don't fail
}
```

### Custom Categorization Rules

Edit the `_categorizeMessage` method in `baseline-enforcer-reporter.js` to add custom patterns:

```javascript
_categorizeMessage(type, text) {
  // Add your custom patterns
  if (text.includes('Your custom warning pattern')) {
    return 'Custom: Your warning category';
  }

  // ... existing patterns ...
}
```

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Jest Test Run                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│         jest-clean-console-reporter (Layer 1)           │
│  • Groups similar warnings by pattern                   │
│  • Counts occurrences                                   │
│  • Outputs clean summary                                │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│      baseline-enforcer-reporter (Layer 2)               │
│  • Loads baseline JSON                                  │
│  • Compares current vs baseline                         │
│  • Detects violations & improvements                    │
│  • Fails tests if violations found                      │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   Test Result                           │
│  ✅ Pass (baseline matches or improved)                │
│  ❌ Fail (new warnings detected)                        │
└─────────────────────────────────────────────────────────┘
```

### Reporter Flow

1. Tests run and generate console messages
2. `baseline-enforcer-reporter` collects all messages
3. Messages are categorized using pattern matching
4. Counts are compared with baseline
5. Report is generated showing violations/improvements
6. Tests fail if violations found and `failOnViolation: true`

## Benefits

1. **Prevents Regression**: Cannot introduce new warnings without explicit baseline update
2. **Encourages Improvement**: Visually shows progress when warnings are fixed
3. **Clear Metrics**: Exact counts make progress measurable
4. **Low Friction**: Works automatically, no manual tracking needed
5. **Team Alignment**: Everyone sees the same baseline state
6. **Gradual Improvement**: Fix warnings incrementally over time

## Maintenance

### Regenerating Baseline After Node/Jest Updates

```bash
# After upgrading Node or Jest
yarn test:baseline:generate

# Review changes
yarn test:baseline:show

# Commit if changes are expected
git add test/jest/console-baseline-*.json
git commit -m "chore: update console baseline for Node 25"
```

### Monitoring Progress Over Time

```bash
# View current state
yarn test:baseline:show

# Compare with previous baseline
git show HEAD~10:test/jest/console-baseline-unit.json > /tmp/old-baseline.json
git show HEAD:test/jest/console-baseline-unit.json > /tmp/new-baseline.json
diff /tmp/old-baseline.json /tmp/new-baseline.json
```

## Related Documentation

- [Console Reporter Documentation](./CONSOLE-REPORTER.md) - Information about warning grouping
- [Testing Guide](../../docs/testing.md) - General testing documentation
- [Unit Testing Guidelines](../../.cursor/rules/unit-testing-guidelines.mdc) - Unit testing standards

## Support

If you encounter issues:

1. Check this documentation first
2. View current baseline: `yarn test:baseline:show`
3. Try regenerating baseline: `yarn test:baseline:generate`
4. Check Node version matches team standard
5. Ask in #dev-extension Slack channel

