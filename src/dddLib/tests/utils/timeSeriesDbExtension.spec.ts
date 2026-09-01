import { TimeSeriesDbExtension } from '../../utils/timeSeriesDbExtension';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ timeseriesDb: { dbName: 'surveillance' } }),
}));

describe('TimeSeriesDbExtension time ranges', () => {
  it('compares timestamps as UTC epoch milliseconds without any offset', () => {
    const query = TimeSeriesDbExtension.createFindAllQuery({
      superTableName: 'stable',
      timeRangeInUnix: { start: 1_700_000_000_000, end: 1_700_000_060_000 },
    });
    expect(query).toBe(
      'SELECT * FROM surveillance.stable WHERE (createdAt BETWEEN 1700000000000 AND 1700000060000) ;',
    );
  });

  it('uses the same UTC bounds for counts', () => {
    const query = TimeSeriesDbExtension.createCountQuery({
      superTableName: 'stable',
      timeRangeInUnix: { start: 1_700_000_000_000, end: 1_700_000_060_000 },
    });
    expect(query).toBe(
      'SELECT COUNT(*) FROM surveillance.stable WHERE createdAt BETWEEN 1700000000000 AND 1700000060000;',
    );
  });

  it('rejects non-integer time range bounds', () => {
    expect(() =>
      TimeSeriesDbExtension.createFindAllQuery({
        superTableName: 'stable',
        timeRangeInUnix: {
          start: 1_700_000_000_000.5,
          end: 1_700_000_060_000,
        },
      }),
    ).toThrow('time range bounds must be finite unix millisecond integers');
  });

  it('rejects an inverted time range', () => {
    expect(() =>
      TimeSeriesDbExtension.createCountQuery({
        superTableName: 'stable',
        timeRangeInUnix: { start: 2, end: 1 },
      }),
    ).toThrow('time range start must not exceed end');
  });
});

describe('TimeSeriesDbExtension.quoteStringLiteral', () => {
  it('doubles single quotes so a value cannot terminate the literal', () => {
    expect(TimeSeriesDbExtension.quoteStringLiteral("it's")).toBe("'it''s'");
  });

  it('escapes backslashes', () => {
    expect(TimeSeriesDbExtension.quoteStringLiteral('a\\b')).toBe("'a\\\\b'");
  });

  it('prevents a quoted value from appending SQL', () => {
    const malicious = "x' OR '1'='1";
    const literal = TimeSeriesDbExtension.quoteStringLiteral(malicious);
    expect(literal).toBe("'x'' OR ''1''=''1'");
    expect(literal.startsWith("'x''")).toBe(true);
  });
});
