import { BusinessId } from '../businessId.vo';

describe('BusinessId', () => {
  it('rejects an empty business ID', () => {
    expect(() => new BusinessId('')).toThrow();
  });

  it('rejects a malformed business ID', () => {
    expect(() => new BusinessId('not-a-uuid')).toThrow();
  });

  it('accepts a UUID business ID', () => {
    const id = '0f10532e-cbad-4b3e-8589-a27ddff553c4';

    expect(new BusinessId(id).unpack()).toBe(id);
  });
});
