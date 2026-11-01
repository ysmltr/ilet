import type { IncomingMessage, ServerResponse } from 'node:http';

import type { PairedDevice } from '../auth/deviceRegistry';
import { RequestHeader } from '../protocol/constants';
import { ProtocolError } from '../shared/errors';
import type { Logger } from '../shared/logger';
import { isAllowedHostHeader } from './networkAddress';
import { sendError } from './responses';

export type HttpMethod = 'GET' | 'POST';

export interface RequestContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
}

export interface PairedDeviceContext extends RequestContext {
  readonly device: PairedDevice;
}

interface RouteBase {
  readonly method: HttpMethod;
  readonly path: string;
  readonly acceptsBody: boolean;
}

export interface PublicRoute extends RouteBase {
  readonly access: 'public';
  handle(context: RequestContext): Promise<void> | void;
}

export interface PairedDeviceRoute extends RouteBase {
  readonly access: 'paired-device';
  handle(context: PairedDeviceContext): Promise<void> | void;
}

export type Route = PublicRoute | PairedDeviceRoute;

/** Returns the paired device behind a request, or throws a ProtocolError. */
export type Authenticator = (request: IncomingMessage) => PairedDevice;

export interface RequestHandlerDependencies {
  readonly routes: readonly Route[];
  readonly authenticate: Authenticator;
  readonly logger: Logger;
}

export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void;

/**
 * Applies the common rules from PROTOCOL.md section 3 in a fixed order: browser checks, routing,
 * body policy, authentication. Only then does a route see the request.
 */
export function createRequestHandler(dependencies: RequestHandlerDependencies): RequestListener {
  return (request, response) => {
    dispatch(request, response, dependencies).catch((error: unknown) => {
      sendError(response, error, dependencies.logger);
    });
  };
}

async function dispatch(
  request: IncomingMessage,
  response: ServerResponse,
  { routes, authenticate }: RequestHandlerDependencies,
): Promise<void> {
  rejectBrowserRequests(request);
  const route = findRoute(routes, request);
  if (!route.acceptsBody && hasBody(request)) {
    throw new ProtocolError('payload_too_large');
  }
  if (route.access === 'public') {
    await route.handle({ request, response });
    return;
  }
  await route.handle({ request, response, device: authenticate(request) });
}

/** Blocks CSRF and DNS rebinding (THREAT_MODEL.md T4). */
function rejectBrowserRequests(request: IncomingMessage): void {
  const hasOrigin = request.headers[RequestHeader.origin] !== undefined;
  if (hasOrigin || !isAllowedHostHeader(request.headers[RequestHeader.host])) {
    throw new ProtocolError('forbidden');
  }
}

function findRoute(routes: readonly Route[], request: IncomingMessage): Route {
  const path = requestPath(request);
  const routesForPath = routes.filter((route) => route.path === path);
  if (routesForPath.length === 0) {
    throw new ProtocolError('not_found');
  }
  const route = routesForPath.find((candidate) => candidate.method === request.method);
  if (route === undefined) {
    throw new ProtocolError('method_not_allowed', {
      allowedMethods: routesForPath.map((candidate) => candidate.method),
    });
  }
  return route;
}

/** The path of an origin-form request target, without the query; `undefined` for other forms. */
function requestPath(request: IncomingMessage): string | undefined {
  const target = request.url ?? '';
  return target.startsWith('/') ? target.split('?')[0] : undefined;
}

function hasBody(request: IncomingMessage): boolean {
  const contentLength = request.headers[RequestHeader.contentLength];
  return (
    request.headers[RequestHeader.transferEncoding] !== undefined ||
    (contentLength !== undefined && contentLength !== '0')
  );
}
