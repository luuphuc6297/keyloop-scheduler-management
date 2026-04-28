import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance: string;
  request_id?: string;
  timestamp: string;
  [extra: string]: unknown;
}

interface MinimalRequest {
  id?: string;
  url?: string;
}

interface MinimalResponse {
  status(code: number): MinimalResponse;
  setHeader(name: string, value: string): MinimalResponse;
  json(body: unknown): void;
}

const RESERVED_KEYS = new Set(['statusCode', 'error', 'message', 'code']);

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<MinimalResponse>();
    const request = ctx.getRequest<MinimalRequest>();
    const requestId = request?.id;
    const instance = request?.url ?? '';

    const { status, problem } = this.toProblem(exception, instance, requestId);

    if (status >= 500) {
      this.logger.error(`unhandled exception (request_id=${requestId ?? 'n/a'}): ${String(exception)}`);
    }

    response.status(status);
    response.setHeader('Content-Type', 'application/problem+json');
    response.json(problem);
  }

  private toProblem(
    exception: unknown,
    instance: string,
    requestId?: string,
  ): { status: number; problem: ProblemDetails } {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const detail = typeof raw === 'string' ? raw : this.extractDetail(raw);
      const code = this.extractCode(raw) ?? this.codeForStatus(status);
      const extras = this.extractExtras(raw);

      const problem: ProblemDetails = {
        type: `https://api.scheduler.local/problems/${code.toLowerCase().replace(/_/g, '-')}`,
        title: this.titleForStatus(status),
        status,
        code,
        instance,
        timestamp,
        ...extras,
      };
      if (detail !== undefined) {
        problem.detail = detail;
      }
      if (requestId !== undefined) {
        problem.request_id = requestId;
      }
      return { status, problem };
    }

    return {
      status: 500,
      problem: {
        type: 'https://api.scheduler.local/problems/internal-error',
        title: 'Internal Server Error',
        status: 500,
        code: 'INTERNAL_ERROR',
        instance,
        timestamp,
        ...(requestId !== undefined ? { request_id: requestId } : {}),
      },
    };
  }

  private extractDetail(raw: unknown): string | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const message = (raw as Record<string, unknown>).message;
    return typeof message === 'string' ? message : undefined;
  }

  private extractCode(raw: unknown): string | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const code = (raw as Record<string, unknown>).code;
    return typeof code === 'string' ? code : undefined;
  }

  private extractExtras(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'object' || raw === null) return {};
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!RESERVED_KEYS.has(k)) {
        result[k] = v;
      }
    }
    return result;
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.PRECONDITION_FAILED:
        return 'PRECONDITION_FAILED';
      case 423:
        return 'LOCKED';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      default:
        return 'ERROR';
    }
  }

  private titleForStatus(status: number): string {
    if (status >= 500) return 'Internal Server Error';
    if (status === 400) return 'Bad Request';
    if (status === 401) return 'Unauthorized';
    if (status === 403) return 'Forbidden';
    if (status === 404) return 'Not Found';
    if (status === 409) return 'Conflict';
    if (status === 412) return 'Precondition Failed';
    if (status === 423) return 'Locked';
    if (status === 429) return 'Too Many Requests';
    return 'Error';
  }
}
