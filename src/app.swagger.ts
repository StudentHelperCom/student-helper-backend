import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, InternalServerErrorException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const initSwagger = (app: INestApplication, admin: { name: string; pass: string }, apiPrefix: string) => {
  // if you are using setGlobalPrefix -> use it before initSwagger()
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.use(`/${apiPrefix}/doc/*path`, (req: Request, res: Response, next: NextFunction) => {
    function parseAuthHeader(input: string): { name: string | undefined; pass: string | undefined } {
      const [, encodedPart] = input.split(' ');

      if (!encodedPart) {
        throw new InternalServerErrorException('Invalid authorization header');
      }

      const buff = Buffer.from(encodedPart, 'base64');
      const text = buff.toString('ascii');
      const [name, pass] = text.split(':');
      return { name, pass };
    }
    function unauthorizedResponse(): void {
      if (httpAdapter.getType() === 'fastify') {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic');
      } else {
        res.status(401);
        res.set('WWW-Authenticate', 'Basic');
      }
      next();
    }
    if (!req.headers.authorization) {
      return unauthorizedResponse();
    }
    const credentials = parseAuthHeader(req.headers.authorization);
    if (credentials?.name !== admin?.name || credentials?.pass !== admin?.pass) {
      return unauthorizedResponse();
    }
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('student_helper')
    .setDescription('The student_helper API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: false,
  });
  SwaggerModule.setup(`${apiPrefix}/doc`, app, document, {
    swaggerOptions: {
      filter: true,
    },
  });
};
