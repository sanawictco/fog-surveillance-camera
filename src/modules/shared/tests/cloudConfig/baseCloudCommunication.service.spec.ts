import {
  BaseCloudCommunicationService,
  FogCloudConfigType,
} from '../../cloudConfig/baseCloudCommunication.service';
import { GLOBAL_ERROR_EVENT } from 'src/utilities/exception.filter';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    cloudHttpUrl: 'https://cloud.example.test',
    nvrSerialNumber: 'AB12CD34',
    nvrAccessToken: 'super-secret-access-token-value',
  }),
}));

class TestCloudCommunicationService extends BaseCloudCommunicationService {
  protected getConfigType(): FogCloudConfigType {
    return 'videoDevice';
  }
  protected getSoftwareConfigTopic(): string {
    return 'tenants/t1/nvrs/n1/config/to-cloud';
  }
}

function buildService(overrides?: {
  post?: jest.Mock;
  publish?: jest.Mock;
}) {
  const httpService = { post: overrides?.post ?? jest.fn() };
  const mqttService = { publish: overrides?.publish ?? jest.fn() };
  const emit = jest.fn();
  const error = jest.fn();
  const serviceProvider = {
    httpService,
    eventEmitter: { emit },
    logger: { error },
  };
  const service = new TestCloudCommunicationService(
    mqttService as never,
    serviceProvider as never,
  );
  return { service, httpService, mqttService, emit, error };
}

describe('BaseCloudCommunicationService', () => {
  it('publishes the msg to the subclass software config topic', async () => {
    const { service, mqttService } = buildService();

    await service.sendSoftwareConfigMsgId({ msgId: '000123' });

    expect(mqttService.publish).toHaveBeenCalledWith(
      'tenants/t1/nvrs/n1/config/to-cloud',
      JSON.stringify({ msgId: '000123' }),
    );
  });

  it('fetches config from cloud, sending msgId as an opaque string', async () => {
    const post = jest
      .fn()
      .mockResolvedValue({ data: { configType: 'search', data: {} } });
    const { service } = buildService({ post });

    const result = await service.getSoftwareConfigFromCloud('000123');

    expect(post).toHaveBeenCalledWith(
      'https://cloud.example.test/fog-communication-manager/configs',
      {
        serialNumber: 'AB12CD34',
        accessToken: 'super-secret-access-token-value',
        msgId: '000123',
        configType: 'videoDevice',
      },
    );
    expect(result).toEqual({
      statusCode: 200,
      message: { configType: 'search', data: {} },
    });
  });

  it('emits GLOBAL_ERROR_EVENT and rethrows on HTTP failure, without leaking the access token', async () => {
    const httpError = new Error('HTTP 500: Internal Server Error');
    // Simulate HttpService's error enrichment (src/extensions/http/http.service.ts),
    // which attaches the raw axios response - including the serialized request
    // body containing the plaintext accessToken - onto the thrown Error.
    Object.assign(httpError, {
      statusCode: 500,
      response: {
        status: 500,
        data: { message: 'Internal Server Error' },
        config: {
          data: JSON.stringify({
            serialNumber: 'AB12CD34',
            accessToken: 'super-secret-access-token-value',
            msgId: '000123',
            configType: 'videoDevice',
          }),
        },
      },
    });
    const post = jest.fn().mockRejectedValue(httpError);
    const { service, emit, error } = buildService({ post });

    await expect(
      service.getSoftwareConfigFromCloud('000123'),
    ).rejects.toThrow('HTTP 500: Internal Server Error');

    // logCloudError: the real Error goes in the `trace` slot, metadata goes
    // in `...meta` - so LoggerService can format the error itself instead of
    // burying it as a `cause` on a misleading "Non-Error value thrown" Error.
    // The logged `trace` must be a FRESH, message-only Error though - not the
    // enriched `httpError` - because LoggerService hands an Error `trace` to
    // pino's `err` serializer, which copies ALL own enumerable properties
    // (including `.response.config.data`, which holds the plaintext token).
    expect(error).toHaveBeenCalledTimes(1);
    const [loggedMessage, loggedTrace, loggedMeta] = error.mock.calls[0];
    expect(loggedMessage).toBe('Cloud HTTP connection failed');
    expect(loggedTrace).not.toBe(httpError);
    expect(loggedTrace).toBeInstanceOf(Error);
    expect(loggedTrace.message).toBe(httpError.message);
    expect((loggedTrace as Record<string, unknown>).response).toBeUndefined();
    expect((loggedTrace as Record<string, unknown>).config).toBeUndefined();
    expect((loggedTrace as Record<string, unknown>).request).toBeUndefined();
    expect(JSON.stringify(loggedTrace)).not.toContain(
      'super-secret-access-token-value',
    );
    expect(loggedMeta).toEqual({ msgId: '000123', configType: 'videoDevice' });

    // GLOBAL_ERROR_EVENT must receive a sanitized, fresh Error - not the
    // enriched one carrying `.response.config.data` (which holds the token).
    expect(emit).toHaveBeenCalledTimes(1);
    const [eventName, emittedError] = emit.mock.calls[0];
    expect(eventName).toBe(GLOBAL_ERROR_EVENT);
    expect(emittedError).not.toBe(httpError);
    expect(emittedError).toBeInstanceOf(Error);
    expect(emittedError.message).toBe('HTTP 500: Internal Server Error');
    expect((emittedError as Record<string, unknown>).response).toBeUndefined();
    expect((emittedError as Record<string, unknown>).config).toBeUndefined();
    expect((emittedError as Record<string, unknown>).request).toBeUndefined();
    expect(JSON.stringify(emit.mock.calls)).not.toContain(
      'super-secret-access-token-value',
    );
  });
});
