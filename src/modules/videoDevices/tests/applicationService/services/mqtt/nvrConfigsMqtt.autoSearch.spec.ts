import { NvrConfigsMqttService } from '../../../../applicationService/services/mqtt/nvrConfigsMqtt.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ tenantId: 'tenant-1', nvrId: 'nvr-1' }),
}));

describe('NvrConfigsMqttService.autoSearch', () => {
  it('publishes every discovered camera in the search ack', async () => {
    const sendSoftwareConfigMsgId = jest.fn().mockResolvedValue(undefined);
    const discover = jest.fn().mockResolvedValue([
      {
        macAddress: 'AA:BB:CC:DD:EE:FF',
        endpointReference: 'uuid:device-1234',
        ipAddress: '192.168.10.51',
        interfaceName: 'eth1',
        status: 'ONVIF_READY',
        discoveredVia: ['lease', 'onvif'],
        manufacturer: 'ACME',
        model: 'IPC-1234',
        firmwareVersion: 'V5.7.3',
        onvifXaddr: 'http://192.168.10.51:8899/onvif/device_service',
        suggestedName: 'Lobby',
        hasPtz: true,
        hasAudio: false,
        conflictMacAddresses: ['BB:CC:DD:EE:FF:00'],
      },
    ]);

    await new NvrConfigsMqttService(
      { logger: { error: jest.fn(), debug: jest.fn() } } as never,
      { sendSoftwareConfigMsgId } as never,
      { discover } as never,
    ).autoSearch();

    expect(sendSoftwareConfigMsgId).toHaveBeenCalledWith({
      msgId: 'search',
      mqttData: {
        discoveredCameras: [
          {
            macAddress: 'AA:BB:CC:DD:EE:FF',
            endpointReference: 'uuid:device-1234',
            ipAddress: '192.168.10.51',
            status: 'ONVIF_READY',
            discoveredVia: ['lease', 'onvif'],
            manufacturer: 'ACME',
            model: 'IPC-1234',
            firmwareVersion: 'V5.7.3',
            onvifXaddr: 'http://192.168.10.51:8899/onvif/device_service',
            suggestedName: 'Lobby',
            hasPtz: true,
            hasAudio: false,
            conflictMacAddresses: ['BB:CC:DD:EE:FF:00'],
          },
        ],
      },
    });
  });

  it('acks with an empty list when discovery finds nothing', async () => {
    const sendSoftwareConfigMsgId = jest.fn().mockResolvedValue(undefined);
    await new NvrConfigsMqttService(
      { logger: { error: jest.fn(), debug: jest.fn() } } as never,
      { sendSoftwareConfigMsgId } as never,
      { discover: jest.fn().mockResolvedValue([]) } as never,
    ).autoSearch();

    expect(sendSoftwareConfigMsgId).toHaveBeenCalledWith({
      msgId: 'search',
      mqttData: { discoveredCameras: [] },
    });
  });
});
