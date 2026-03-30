'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseFlagValue, removeFlagWithValue } = require('../src/cli');

// ---------------------------------------------------------------------------
// parseFlagValue
// ---------------------------------------------------------------------------
describe('parseFlagValue', () => {
    test('returns the value immediately following the flag', () => {
        assert.equal(parseFlagValue(['sync', '--rules-dir', 'my-rules'], '--rules-dir'), 'my-rules');
    });

    test('works when the flag is first in args', () => {
        assert.equal(parseFlagValue(['--rules-dir', 'my-rules', 'sync'], '--rules-dir'), 'my-rules');
    });

    test('works when the flag is last with a value', () => {
        assert.equal(parseFlagValue(['sync', '--rules-dir', 'my-rules'], '--rules-dir'), 'my-rules');
    });

    test('returns null when the flag is not present', () => {
        assert.equal(parseFlagValue(['sync', '--dry-run'], '--rules-dir'), null);
    });

    test('returns null when the flag is last with no value', () => {
        assert.equal(parseFlagValue(['sync', '--rules-dir'], '--rules-dir'), null);
    });

    test('returns null when the next token looks like another flag', () => {
        assert.equal(parseFlagValue(['sync', '--rules-dir', '--dry-run'], '--rules-dir'), null);
    });

    test('returns null for empty args', () => {
        assert.equal(parseFlagValue([], '--rules-dir'), null);
    });

    test('handles absolute paths as values', () => {
        assert.equal(parseFlagValue(['--rules-dir', '/abs/path/rules', 'sync'], '--rules-dir'), '/abs/path/rules');
    });
});

// ---------------------------------------------------------------------------
// removeFlagWithValue
// ---------------------------------------------------------------------------
describe('removeFlagWithValue', () => {
    test('removes the flag and its value', () => {
        assert.deepEqual(
            removeFlagWithValue(['sync', '--rules-dir', 'my-rules', '--dry-run'], '--rules-dir'),
            ['sync', '--dry-run']
        );
    });

    test('removes the flag when it appears first', () => {
        assert.deepEqual(
            removeFlagWithValue(['--rules-dir', 'my-rules', 'sync'], '--rules-dir'),
            ['sync']
        );
    });

    test('returns original array when flag is not present', () => {
        const args = ['sync', '--dry-run'];
        assert.deepEqual(removeFlagWithValue(args, '--rules-dir'), ['sync', '--dry-run']);
    });

    test('returns original array when args is empty', () => {
        assert.deepEqual(removeFlagWithValue([], '--rules-dir'), []);
    });

    test('does not mutate the original array', () => {
        const original = ['sync', '--rules-dir', 'my-rules'];
        const copy = [...original];
        removeFlagWithValue(original, '--rules-dir');
        assert.deepEqual(original, copy);
    });

    test('only removes the first occurrence', () => {
        // Unusual but should handle gracefully
        assert.deepEqual(
            removeFlagWithValue(['--rules-dir', 'a', '--rules-dir', 'b'], '--rules-dir'),
            ['--rules-dir', 'b']
        );
    });
});
