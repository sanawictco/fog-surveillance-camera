import * as env from 'env-var';
const AppConfig = () => ({
  environment: env.get('NODE_ENV').required().asString(),
  port: env.get('NODE_PORT').required().asPortNumber(),
  jwtSecretKey: env.get('JWT_SECRET_KEY').required().asString(),
  cloudHttpUrl: env.get('CLOUD_HTTP_URL').required().asString(),
  internalServerError: env
    .get('INTERNAL_SERVER_ERROR_MESSAGE')
    .required()
    .asString(),
  nvrAccessToken: env.get('NVR_ACCESS_TOKEN').required().asString(),
  nvrSerialNumber: env.get('NVR_SERIAL_NUMBER').required().asString(),
  nvrMacAddress: env.get('NVR_MAC_ADDRESS').required().asIntPositive(),
  nvrId: env.get('NVR_ID').required().asString(),
  mongodb: {
    url: `mongodb://${env.get('MONGO_DB_HOST').required().asString()}:${env.get('MONGO_DB_PORT').required().asPortNumber()}/${env.get('MONGO_DB_NAME').asString()}`,
  },
  timeseriesDb: {
    wsUrl: `ws://${env.get('TIME_SERIES_DB_HOST').required().asString()}:${env.get('TIME_SERIES_DB_REST_PORT').required().asPortNumber()}`,
    user: env.get('TIME_SERIES_DB_USER').required().asString(),
    password: env.get('TIME_SERIES_DB_PASSWORD').required().asString(),
    dbName: env.get('TIME_SERIES_DB_NAME').required().asString(),
    restUrl: `http://${env.get('TIME_SERIES_DB_HOST').required().asString()}:${env.get('TIME_SERIES_DB_REST_PORT').required().asPortNumber()}/rest/sql/${env.get('TIME_SERIES_DB_NAME').required().asString()}`,
    token: `Basic ${Buffer.from(`${env.get('TIME_SERIES_DB_USER').required().asString()}:${env.get('TIME_SERIES_DB_PASSWORD').required().asString()}`).toString('base64')}`,
  },
  redis: {
    host: env.get('REDIS_HOST').required().asString(),
    port: env.get('REDIS_PORT').required().asPortNumber(),
    db: env.get('REDIS_DB').default('3').asIntPositive(),
    password: env.get('REDIS_PASSWORD').default('').asString(),
  },
  mqtt: {
    server: {
      protocol: env
        .get('MQTT_PROTOCOL')
        .default('mqtt')
        .asEnum(['mqtt', 'mqtts', 'ws', 'wss', 'tcp', 'tls']),
      host: env.get('MQTT_HOST').required().asString(),
      port: env.get('MQTT_PORT').required().asPortNumber(),
      username: env.get('NVR_SERIAL_NUMBER').required().asString(),
      password: env.get('NVR_ACCESS_TOKEN').required().asString(),
      clientId: env.get('MQTT_CLIENT_ID').required().asString(),
      clean: env.get('MQTT_CLEAN').default('true').asBool(),
      keepalive: env
        .get('MQTT_KEEPALIVE_SECONDS')
        .default('20')
        .asIntPositive(),
      reconnectPeriod: env
        .get('MQTT_RECONNECT_PERIOD_MS')
        .default('5000')
        .asIntPositive(),
      connectTimeout: env
        .get('MQTT_CONNECT_TIMEOUT_MS')
        .default('15000')
        .asIntPositive(),
      resubscribe: true,
    },
    publishTimeoutMs: env
      .get('MQTT_PUBLISH_TIMEOUT_MS')
      .default('10000')
      .asIntPositive(),
    shutdownTimeoutMs: env
      .get('MQTT_SHUTDOWN_TIMEOUT_MS')
      .default('3000')
      .asIntPositive(),
  },
  swagger: {
    title: env.get('SWAGGER_TITLE').required().asString(),
    version: env.get('SWAGGER_VERSION').required().asString(),
    basePath: env.get('SWAGGER_BASE_PATH').required().asString(),
    description: env.get('SWAGGER_DESCRIPTION').required().asString(),
    tag: env.get('SWAGGER_TAG').required().asString(),
  },
  websocket: {
    authEnabled: env.get('WS_AUTH_ENABLED').default('true').asBool(),
    allowedOrigins: env.get('WS_ALLOWED_ORIGINS').default('').asArray(','),
  },
});
export default AppConfig;
