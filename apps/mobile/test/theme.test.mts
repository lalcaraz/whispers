import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveScheme,
  isThemePreference,
  THEME_PREFERENCES,
  light,
  dark,
} from '../src/theme/index.ts';

test('resolveScheme: explicit preference wins over the OS', () => {
  assert.equal(resolveScheme('light', 'dark'), 'light');
  assert.equal(resolveScheme('dark', 'light'), 'dark');
  assert.equal(resolveScheme('light', null), 'light');
  assert.equal(resolveScheme('dark', undefined), 'dark');
});

test('resolveScheme: system follows the OS, defaults to light', () => {
  assert.equal(resolveScheme('system', 'dark'), 'dark');
  assert.equal(resolveScheme('system', 'light'), 'light');
  assert.equal(resolveScheme('system', null), 'light');
  assert.equal(resolveScheme('system', undefined), 'light');
});

test('isThemePreference guards the stored value', () => {
  assert.equal(isThemePreference('system'), true);
  assert.equal(isThemePreference('light'), true);
  assert.equal(isThemePreference('dark'), true);
  assert.equal(isThemePreference('sepia'), false);
  assert.equal(isThemePreference(null), false);
  assert.equal(isThemePreference(undefined), false);
  assert.equal(isThemePreference(2), false);
});

test('THEME_PREFERENCES lists exactly the three options', () => {
  assert.deepEqual([...THEME_PREFERENCES], ['system', 'light', 'dark']);
});

test('light and dark palettes expose the same keys', () => {
  assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
  for (const [key, value] of Object.entries({ ...light, ...dark })) {
    assert.equal(typeof value, 'string', `${key} must be a color string`);
  }
});
