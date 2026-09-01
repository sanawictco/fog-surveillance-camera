import { LanguageCode } from '../../translation/languageCode.enum';
import { WsAuthService } from '../../websocket/wsAuth.service';

jest.mock('jsonwebtoken', () => ({ decode: jest.fn() }));
jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    keycloak: {
      clientId: 'cloud',
      authServer: 'http://keycloak',
      realm: 'sanaw',
    },
  }),
}));

const tenantId = '11111111-1111-4111-8111-111111111111';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const decode = require('jsonwebtoken').decode as jest.Mock;

describe('WsAuthService', () => {
  beforeEach(() => {
    decode.mockReset();
  });

  it('rejects a connection without an explicit tenant', async () => {
    const tenantAccess = { resolveActiveAccess: jest.fn() };
    const service = new WsAuthService(
      { logger: { error: jest.fn() } } as never,
      tenantAccess as never,
    );

    await expect(
      service.validateWsClient({
        handshake: {
          headers: { authorization: 'Bearer token' },
          auth: {},
        },
      } as never),
    ).resolves.toBeUndefined();
    expect(tenantAccess.resolveActiveAccess).not.toHaveBeenCalled();
  });

  it('stores only server-verified tenant roles for a connection', async () => {
    const tenantAccess = {
      resolveActiveAccess: jest.fn().mockResolvedValue({
        tenantId,
        roles: ['R'],
      }),
    };
    const service = new WsAuthService(
      { logger: { error: jest.fn() } } as never,
      tenantAccess as never,
    );
    jest
      .spyOn(service, 'checkAccessTokenAsOnline')
      .mockResolvedValue({ statusCode: 200, data: {} });
    decode.mockReturnValue({
      sub: 'user-id',
      preferred_username: '09120000000',
      name: 'User',
      lang: LanguageCode.EN,
      resource_access: { cloud: { roles: ['untrusted-keycloak-role'] } },
    });

    await expect(
      service.validateWsClient({
        handshake: {
          headers: { authorization: 'Bearer token' },
          auth: { tenantId },
        },
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'user-id',
        tenantId,
        roles: ['R'],
      }),
    );
    expect(tenantAccess.resolveActiveAccess).toHaveBeenCalledWith(
      tenantId,
      'user-id',
    );
  });
});
