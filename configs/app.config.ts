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
  gatewayAccessToken: env.get('GATEWAY_ACCESS_TOKEN').required().asString(),
  gatewaySerialNumber: env.get('GATEWAY_SERIAL_NUMBER').required().asString(),
  gatewayMacAddress: env.get('GATEWAY_MAC_ADDRESS').required().asIntPositive(),
  gatewayId: env.get('GATEWAY_ID').required().asString(),
  mongodb: {
    url: `mongodb://${env.get('MONGO_DB_HOST').required().asString()}:${env.get('MONGO_DB_PORT').required().asPortNumber()}/${env.get('MONGO_DB_NAME').asString()}`,
  },
  redis: {
    host: env.get('REDIS_HOST').required().asString(),
    port: env.get('REDIS_PORT').required().asPortNumber(),
  },
  mqtt: {
    server: {
      host: env.get('MQTT_HOST').required().asString(),
      port: env.get('MQTT_PORT').required().asPortNumber(),
      username: env.get('GATEWAY_SERIAL_NUMBER').required().asString(),
      password: env.get('GATEWAY_ACCESS_TOKEN').required().asString(),
      clientId: env.get('MQTT_CLIENT_ID').required().asString(),
      clean: true,
      keepalive: 20,
    },
  },
  swagger: {
    title: env.get('SWAGGER_TITLE').required().asString(),
    version: env.get('SWAGGER_VERSION').required().asString(),
    basePath: env.get('SWAGGER_BASE_PATH').required().asString(),
    description: env.get('SWAGGER_DESCRIPTION').required().asString(),
    tag: env.get('SWAGGER_TAG').required().asString(),
  },
});
export default AppConfig;
