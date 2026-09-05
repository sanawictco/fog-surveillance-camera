// src/modules/dashboard/tests/applicationService/services/dashboardCloudCommunicationService.spec.ts
import { DashboardCloudCommunicationService } from '../../../applicationService/services/dashboardCloudCommunicationService';
import { PageEntity } from '../../../domain/page.entity';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    cloudHttpUrl: 'https://cloud.example.test',
    nvrSerialNumber: 'AB12CD34',
    nvrAccessToken: '12345678901234567890123456789012',
    tenantId: 'tenant-id',
    nvrId: 'nvr-id',
  }),
}));

describe('DashboardCloudCommunicationService', () => {
  it('publishes to the page config pub-to-cloud topic', async () => {
    const mqttService = { publish: jest.fn().mockResolvedValue(undefined) };
    const serviceProvider = {
      httpService: { post: jest.fn() },
      eventEmitter: { emit: jest.fn() },
      logger: { error: jest.fn() },
    };
    const service = new DashboardCloudCommunicationService(
      mqttService as never,
      serviceProvider as never,
    );

    await service.sendSoftwareConfigMsgId({ msgId: '000123' });

    expect(mqttService.publish).toHaveBeenCalledWith(
      PageEntity.getFogPubToCloudMqttTopics().pageConfig,
      JSON.stringify({ msgId: '000123' }),
    );
  });

  it('preserves a leading-zero msgId as a string when fetching config from cloud', async () => {
    const post = jest
      .fn()
      .mockResolvedValue({ data: { configType: 'search', data: {} } });
    const serviceProvider = {
      httpService: { post },
      eventEmitter: { emit: jest.fn() },
      logger: { error: jest.fn() },
    };
    const service = new DashboardCloudCommunicationService(
      { publish: jest.fn() } as never,
      serviceProvider as never,
    );

    await service.getSoftwareConfigFromCloud('000123');

    expect(post).toHaveBeenCalledWith(
      'https://cloud.example.test/fog-communication-manager/configs',
      expect.objectContaining({ msgId: '000123', configType: 'page' }),
    );
  });
});
