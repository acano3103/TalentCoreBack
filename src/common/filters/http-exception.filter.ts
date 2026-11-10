import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

// Catches all exceptions application-wide to prevent unhandled 500 errors from
// leaking sensitive stack traces to the client and to enforce a standardized JSON contract.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    let message = 'Internal server error';
    let details = null;
    let code: string | undefined;
    let detail: unknown;

    if (esLimiteMulter(exception)) {
      const errorResponse = {
        success: false,
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        timestamp: new Date().toISOString(),
        path: request.url,
        code: 'ARCHIVO_DEMASIADO_GRANDE',
        message: 'La foto no puede pesar más de 3 MB. Toma otra más ligera e intenta de nuevo.',
        detail: { maxBytes: 3 * 1024 * 1024 },
      };
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json(errorResponse);
      return;
    }

    if (isHttpException && exceptionResponse) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        details = (exceptionResponse as any).error || details;
        if (typeof (exceptionResponse as any).code === 'string') {
          code = (exceptionResponse as any).code;
        }
        if ((exceptionResponse as any).detail !== undefined) {
          detail = (exceptionResponse as any).detail;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`[${request.method}] ${request.url} - ${message}`, exception instanceof Error ? exception.stack : '');
    }

    const errorResponse: Record<string, unknown> = {
      success: false,
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      details: details !== message ? details : undefined,
    };
    if (code) errorResponse.code = code;
    if (detail !== undefined) errorResponse.detail = detail;

    response.status(statusCode).json(errorResponse);
  }
}

function esLimiteMulter(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    (exception as { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}
