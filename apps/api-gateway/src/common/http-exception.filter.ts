import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AxiosError } from 'axios';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (this.isAxiosError(exception)) {
      status = exception.response?.status || HttpStatus.BAD_GATEWAY;
      message = exception.response?.data || 'Microservice Error';
      
      this.logger.warn(`Microservice Error [${request.url}]: ${JSON.stringify(message)}`);
    } else {
      this.logger.error(`Unknown Error: ${exception}`);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: message,
    });
  }

  private isAxiosError(error: any): error is AxiosError {
    return error.isAxiosError === true;
  }
}