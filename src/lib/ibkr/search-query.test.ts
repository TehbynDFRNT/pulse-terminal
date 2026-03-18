import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstrumentSearchQueries,
  parseExplicitFutureQuery,
  sanitizeInstrumentSearchQuery,
} from './search-query.ts';

test('sanitizeInstrumentSearchQuery keeps natural spacing but collapses it', () => {
  assert.equal(sanitizeInstrumentSearchQuery('  AUD / USD  '), 'AUD / USD');
});

test('buildInstrumentSearchQueries adds compact and spaced share-class variants', () => {
  const queries = buildInstrumentSearchQueries('BRKB');

  assert.deepEqual(queries.slice(0, 3), ['BRKB', 'BRK B', 'BRK.B']);
});

test('buildInstrumentSearchQueries keeps natural-name fallback prefixes', () => {
  const queries = buildInstrumentSearchQueries('Berkshire Hathaway B');

  assert.ok(queries.includes('BERKSHIRE HATHAWAY'));
  assert.ok(queries.includes('BERKSHIRE'));
});

test('parseExplicitFutureQuery parses spaced contract months', () => {
  assert.deepEqual(parseExplicitFutureQuery('CL JUN26'), {
    symbol: 'CL',
    month: 'JUN26',
  });
});

test('parseExplicitFutureQuery parses coded contract months', () => {
  assert.deepEqual(parseExplicitFutureQuery('CLM26'), {
    symbol: 'CL',
    month: 'JUN26',
  });
});
