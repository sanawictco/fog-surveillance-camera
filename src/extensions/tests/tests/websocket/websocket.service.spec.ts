import { Socket } from 'socket.io';
import { LanguageCode } from '../../translation/languageCode.enum';
import { WebsocketService } from '../../websocket/websocket.service';
import { EmployeeRoles } from '../../sanawApi/dtos/employees/employeeRoles.enum';
import { WsClientCachedModel } from '../../websocket/websocketClientCachedModel';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ environment: 'production' }),
}));

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';

function cachedUser(
  id: string,
  tenantId: string,
  lang: LanguageCode = LanguageCode.EN,
): WsClientCachedModel {
  return {
    id,
    tenantId,
    phoneNumber: '',
    name: '',
    roles: [EmployeeRoles.Only_View],
    lang,
  };
}

function makeServer(rooms: Record<string, string[]>) {
  const emit = jest.fn();
  const connectedSockets = new Map<string, { disconnect: jest.Mock }>();
  const roomMap = new Map<string, Set<string>>();
  for (const [room, socketIds] of Object.entries(rooms)) {
    roomMap.set(room, new Set(socketIds));
    for (const socketId of socketIds) {
      connectedSockets.set(socketId, { disconnect: jest.fn() });
    }
  }
  const server = {
    sockets: {
      adapter: { rooms: roomMap },
      sockets: connectedSockets,
    },
    to: jest.fn().mockReturnValue({ emit }),
  };
  return { server, emit, connectedSockets };
}

function makeService(
  cache: { getMany: jest.Mock; set?: jest.Mock },
  mocked: ReturnType<typeof makeServer>,
  tenantAccessOverrides?: { resolveActiveAccess: jest.Mock },
) {
  const tenantAccess = {
    resolveActiveAccess: jest.fn().mockResolvedValue({
      tenantId: tenantA,
      roles: [EmployeeRoles.Only_View],
      isOwner: false,
    }),
    ...tenantAccessOverrides,
  };
  const translatorService = {
    translateByPattern: jest.fn(),
    translateByName: jest.fn(),
  };
  const service = new WebsocketService(
    cache as never,
    {
      translatorService,
      logger: { log: jest.fn(), error: jest.fn() },
    } as never,
    {} as never,
    {} as never,
    tenantAccess as never,
  );
  Object.assign(service, { server: mocked.server });
  return { service, tenantAccess, translatorService };
}

describe('WebsocketService', () => {
  it('delivers a tenant event only to sockets joined in that tenant room', async () => {
    jest.useFakeTimers();
    const mocked = makeServer({
      [`tenant:${tenantA}`]: ['socket-a1', 'socket-a2'],
      [`tenant:${tenantB}`]: ['socket-b1'],
    });
    const cache = {
      getMany: jest.fn().mockResolvedValue(
        new Map([
          ['socket-a1', cachedUser('user-a1', tenantA)],
          ['socket-a2', cachedUser('user-a2', tenantA)],
          ['socket-b1', cachedUser('user-b1', tenantB)],
        ]),
      ),
    };
    const { service } = makeService(cache, mocked);

    service.sendTenantMessage(tenantA, service.channels.VIDEO_DEVICES_SOCKET, {
      type: 'config',
      data: { id: 'nvr-1' },
    });
    await jest.runOnlyPendingTimersAsync();

    expect(mocked.server.to).toHaveBeenCalledTimes(2);
    expect(mocked.server.to).toHaveBeenCalledWith('socket-a1');
    expect(mocked.server.to).toHaveBeenCalledWith('socket-a2');
    expect(mocked.server.to).not.toHaveBeenCalledWith('socket-b1');
    expect(mocked.emit).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('rejects a business send without a valid explicit tenant', async () => {
    const mocked = makeServer({ [`tenant:${tenantA}`]: ['socket-a1'] });
    const cache = {
      getMany: jest.fn().mockResolvedValue(new Map()),
    };
    const { service } = makeService(cache, mocked);

    service.sendTenantMessage(
      undefined as never,
      service.channels.VIDEO_DEVICES_SOCKET,
      { type: 'config', data: {} },
    );
    service.sendTenantMessage(
      'not-a-uuid',
      service.channels.VIDEO_DEVICES_SOCKET,
      { type: 'config', data: {} },
    );
    service.sendTenantMessage(
      'x1111111-1111-4111-8111-111111111111y',
      service.channels.VIDEO_DEVICES_SOCKET,
      { type: 'config', data: {} },
    );

    expect(cache.getMany).not.toHaveBeenCalled();
    expect(mocked.server.to).not.toHaveBeenCalled();
    expect(mocked.emit).not.toHaveBeenCalled();
  });

  it('delivers system logs only to members with active access and disconnects revoked sockets', async () => {
    jest.useFakeTimers();
    const mocked = makeServer({
      [`tenant:${tenantA}`]: ['socket-a1', 'socket-a2'],
    });
    const cache = {
      getMany: jest.fn().mockResolvedValue(
        new Map([
          ['socket-a1', cachedUser('user-a1', tenantA)],
          ['socket-a2', cachedUser('user-a2', tenantA)],
        ]),
      ),
    };
    const { service, tenantAccess } = makeService(cache, mocked, {
      resolveActiveAccess: jest
        .fn()
        .mockResolvedValueOnce({ tenantId: tenantA, roles: [], isOwner: false })
        .mockResolvedValueOnce(undefined),
    });

    service.sendTenantMessage(tenantA, service.channels.SYSTEM_LOGS_SOCKET, {
      type: 'log',
      data: { tenantId: tenantA },
    });
    await jest.runOnlyPendingTimersAsync();

    expect(tenantAccess.resolveActiveAccess).toHaveBeenCalledTimes(2);
    expect(mocked.server.to).toHaveBeenCalledTimes(1);
    expect(mocked.server.to).toHaveBeenCalledWith('socket-a1');
    expect(
      mocked.connectedSockets.get('socket-a2')!.disconnect,
    ).toHaveBeenCalledWith(true);
    expect(
      mocked.connectedSockets.get('socket-a1')!.disconnect,
    ).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('delivers system logs to any active tenant member regardless of role', async () => {
    jest.useFakeTimers();
    const mocked = makeServer({ [`tenant:${tenantA}`]: ['socket-a1'] });
    const cache = {
      getMany: jest
        .fn()
        .mockResolvedValue(
          new Map([['socket-a1', cachedUser('user-a1', tenantA)]]),
        ),
    };
    const { service } = makeService(cache, mocked);

    service.sendTenantMessage(tenantA, service.channels.SYSTEM_LOGS_SOCKET, {
      type: 'log',
      data: { tenantId: tenantA },
    });
    await jest.runOnlyPendingTimersAsync();

    expect(mocked.server.to).toHaveBeenCalledWith('socket-a1');
    expect(mocked.emit).toHaveBeenCalledWith(
      service.channels.SYSTEM_LOGS_SOCKET,
      expect.objectContaining({ data: { tenantId: tenantA } }),
    );
    jest.useRealTimers();
  });

  it('skips a socket whose cached tenant does not match the target tenant', async () => {
    jest.useFakeTimers();
    const mocked = makeServer({ [`tenant:${tenantA}`]: ['socket-forged'] });
    const cache = {
      getMany: jest
        .fn()
        .mockResolvedValue(
          new Map([['socket-forged', cachedUser('user-x', tenantB)]]),
        ),
    };
    const { service } = makeService(cache, mocked);

    service.sendTenantMessage(tenantA, service.channels.VIDEO_DEVICES_SOCKET, {
      type: 'config',
      data: {},
    });
    await jest.runOnlyPendingTimersAsync();

    expect(mocked.server.to).not.toHaveBeenCalled();
    expect(mocked.emit).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('translates the message per recipient language', async () => {
    jest.useFakeTimers();
    const mocked = makeServer({
      [`tenant:${tenantA}`]: ['socket-en', 'socket-fa'],
    });
    const cache = {
      getMany: jest.fn().mockResolvedValue(
        new Map([
          ['socket-en', cachedUser('user-en', tenantA, LanguageCode.EN)],
          ['socket-fa', cachedUser('user-fa', tenantA, LanguageCode.FA)],
        ]),
      ),
    };
    const { service, translatorService } = makeService(cache, mocked);
    translatorService.translateByPattern.mockImplementation(
      (msgKey: string, _params: unknown, lang: LanguageCode) =>
        `${msgKey}:${lang}`,
    );

    service.sendTenantMessage(tenantA, service.channels.VIDEO_DEVICES_SOCKET, {
      type: 'config',
      data: { id: 'nvr-1' },
      message: { msgKey: 'k', msgParams: ['p'] },
    });
    await jest.runOnlyPendingTimersAsync();

    expect(translatorService.translateByPattern).toHaveBeenCalledWith(
      'k',
      ['p'],
      LanguageCode.EN,
    );
    expect(translatorService.translateByPattern).toHaveBeenCalledWith(
      'k',
      ['p'],
      LanguageCode.FA,
    );
    expect(mocked.emit).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('joins a verified connection to its tenant room', async () => {
    const mocked = makeServer({});
    const cache = {
      getMany: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = makeService(cache, mocked);
    const client = {
      id: 'socket-a1',
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
    Object.assign(service, {
      wsAuthService: {
        validateWsClient: jest
          .fn()
          .mockResolvedValue(cachedUser('user-a1', tenantA)),
      },
    });

    await service.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('socket-a1');
    expect(client.join).toHaveBeenCalledWith(`tenant:${tenantA}`);
    expect(cache.set).toHaveBeenCalledWith('socket-a1', expect.anything());
    jest.useRealTimers();
  });

  it('disconnects an unverified connection instead of joining a room', async () => {
    const mocked = makeServer({});
    const cache = { getMany: jest.fn(), set: jest.fn() };
    const { service } = makeService(cache, mocked);
    const client = {
      id: 'socket-x',
      join: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
    Object.assign(service, {
      wsAuthService: {
        validateWsClient: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('force-disconnects only the target tenant sockets', () => {
    const mocked = makeServer({
      [`tenant:${tenantA}`]: ['socket-a1', 'socket-a2'],
      [`tenant:${tenantB}`]: ['socket-b1'],
    });
    const cache = { getMany: jest.fn() };
    const { service } = makeService(cache, mocked);

    const disconnected = service.disconnectTenantSockets(tenantA);

    expect(disconnected).toBe(2);
    expect(
      mocked.connectedSockets.get('socket-a1')!.disconnect,
    ).toHaveBeenCalledWith(true);
    expect(
      mocked.connectedSockets.get('socket-a2')!.disconnect,
    ).toHaveBeenCalledWith(true);
    expect(
      mocked.connectedSockets.get('socket-b1')!.disconnect,
    ).not.toHaveBeenCalled();
  });

  it('refuses to force-disconnect for an invalid tenant', () => {
    const mocked = makeServer({ [`tenant:${tenantA}`]: ['socket-a1'] });
    const { service } = makeService({ getMany: jest.fn() }, mocked);

    expect(service.disconnectTenantSockets('not-a-uuid')).toBe(0);
    expect(
      mocked.connectedSockets.get('socket-a1')!.disconnect,
    ).not.toHaveBeenCalled();
  });
});
