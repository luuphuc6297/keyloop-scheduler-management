import { BadRequestException, ConflictException, type ArgumentsHost } from '@nestjs/common';
import { ProblemDetailsFilter } from './problem-details.filter';

interface MockResponse {
  status: jest.Mock;
  setHeader: jest.Mock;
  json: jest.Mock;
}

interface MockHostWithCapture extends ArgumentsHost {
  __response: MockResponse;
}

function makeHost(req: { id?: string; url?: string } = { id: 'rid-1', url: '/test' }): MockHostWithCapture {
  const response: MockResponse = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => req,
    }),
    __response: response,
  } as unknown as MockHostWithCapture;
  return host;
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('shapes a BadRequestException as RFC 7807', () => {
    const host = makeHost();
    filter.catch(new BadRequestException({ code: 'INVALID_INPUT', message: 'bad' }), host);

    expect(host.__response.status).toHaveBeenCalledWith(400);
    expect(host.__response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    const body = host.__response.json.mock.calls[0][0];
    expect(body.status).toBe(400);
    expect(body.code).toBe('INVALID_INPUT');
    expect(body.detail).toBe('bad');
    expect(body.request_id).toBe('rid-1');
    expect(body.instance).toBe('/test');
  });

  it('shapes a ConflictException with conflictingResource extras', () => {
    const host = makeHost();
    filter.catch(new ConflictException({ code: 'BAY_UNAVAILABLE', conflictingResource: 'bay' }), host);

    const body = host.__response.json.mock.calls[0][0];
    expect(body.status).toBe(409);
    expect(body.code).toBe('BAY_UNAVAILABLE');
    expect(body.conflictingResource).toBe('bay');
  });

  it('shapes a generic Error as 500 INTERNAL_ERROR', () => {
    const host = makeHost();
    filter.catch(new Error('boom'), host);

    expect(host.__response.status).toHaveBeenCalledWith(500);
    const body = host.__response.json.mock.calls[0][0];
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.title).toBe('Internal Server Error');
  });

  it('omits request_id when not present on request', () => {
    const host = makeHost({ url: '/no-id' });
    filter.catch(new BadRequestException('something'), host);
    const body = host.__response.json.mock.calls[0][0];
    expect(body.request_id).toBeUndefined();
    expect(body.instance).toBe('/no-id');
  });
});
