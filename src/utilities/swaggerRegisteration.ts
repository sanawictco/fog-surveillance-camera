import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import AppConfig from 'configs/app.config';
export const SWAGGER_AUTH_TOKEN = 'authorization';
export const setupSwaggerRegisteration = (app) => {
  if (AppConfig().environment !== 'production') {
    const config = new DocumentBuilder()
      .setTitle(AppConfig().swagger.title)
      .setDescription(AppConfig().swagger.description)
      .setVersion(AppConfig().swagger.version)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        SWAGGER_AUTH_TOKEN,
      )
      .addTag(AppConfig().swagger.tag)
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(AppConfig().swagger.basePath, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }
};
