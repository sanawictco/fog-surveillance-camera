import { PageEntity } from '../../domain/page.entity';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ tenantId: 'tenant-1', nvrId: 'nvr-1' }),
}));

describe('PageEntity MQTT topics', () => {
  it('matches cloud-surveillance-camera pageConfigPubTopic for both directions', () => {
    expect(PageEntity.getFogPubToCloudMqttTopics()).toEqual({
      pageConfig: 'tenants/tenant-1/nvrs/nvr-1/pages/to-cloud',
    });
    expect(PageEntity.getFogSubOnCloudMqttTopics()).toEqual({
      pageConfigs: 'tenants/tenant-1/nvrs/nvr-1/pages/to-fog',
    });
  });
});
