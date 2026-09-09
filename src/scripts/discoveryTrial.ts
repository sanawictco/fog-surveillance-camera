import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { writeFile } from 'node:fs/promises';
import { AppModule } from '../app.module';
import { CameraDiscoveryService } from '../modules/videoDevices/applicationService/services/discovery/cameraDiscovery.service';

/**
 * Phase 1 hardware trial trigger (design spec §17).
 *
 * In production discovery runs only when the cloud sends `nvrConfig.search`.
 * On a bench or a site visit that dependency is not there, so this drives the
 * same `CameraDiscoveryService.discover()` the MQTT path calls — same DI graph,
 * same scanner preflight — and writes the inventory where a human can read it.
 *
 * Do not run this while the app container is up: `MQTT_CLIENT_ID` is a single
 * shared value, so a second client takes the broker session from the first.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  try {
    const startedAt = Date.now();
    const cameras = await app.get(CameraDiscoveryService).discover();
    const elapsedMs = Date.now() - startedAt;
    const report = {
      startedAt: new Date(startedAt).toISOString(),
      elapsedMs,
      cameraCount: cameras.length,
      cameras,
    };
    // The container is read_only; /fog_shared_backups is a real bind mount.
    const outputPath = process.argv[2] ?? '/fog_shared_backups/discovery-trial.json';
    await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(
      `discovery trial: ${cameras.length} camera(s) in ${elapsedMs} ms -> ${outputPath}\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('discovery trial failed', error);
  process.exitCode = 1;
});
