import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AppLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    if (process.env.SHOW_REQUESTS_LOGS) {
      const fullUrl = `${request.protocol}://${request.get('Host')}${request.originalUrl}`;
      const { ip, method, path: url } = request;
      const userAgent = request.get('user-agent') || '';
      const token = request.headers?.authorization ? request.headers?.authorization.split('Bearer ')[1] : '';
      response.on('close', () => {
        const { statusCode } = response;
        this.logger.log(`Token\n${token}`);
        this.logger.log(`Endpoint\n${method} ${fullUrl} - ${statusCode}`);
        this.logger.log(`Body\n${JSON.stringify(request.body)}`);
      });
    }

    next();
  }
}
