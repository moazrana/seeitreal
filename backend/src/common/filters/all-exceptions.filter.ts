import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Catches everything. HttpExceptions we threw on purpose (validation, 404,
 * 403, etc.) already carry a safe message and are passed through as-is;
 * anything unexpected (a thrown Error, a DB driver error, ...) is logged
 * server-side with full detail and turned into a generic 500 for the client
 * — stack traces and SQL errors never reach a response body (spec §7.7).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : 'Internal server error';
    const body =
      typeof exceptionResponse === 'string'
        ? { statusCode: status, message: exceptionResponse }
        : {
            statusCode: status,
            ...(exceptionResponse as Record<string, unknown>),
          };

    response.status(status).json(body);
  }
}
