import type { IncomingMessage, ServerResponse } from 'node:http';

import type { DeviceRegistry } from '../../auth/deviceRegistry';
import type { FailureRateLimiter } from '../../auth/failureRateLimiter';
import type { PairingCodes } from '../../pairing/pairingCodes';
import { ApiPath } from '../../protocol/constants';
import { ProtocolError } from '../../shared/errors';
import type { Logger } from '../../shared/logger';
import { sanitizeDisplayName } from '../../shared/text';
import { isRecord } from '../../shared/validation';
import { clientAddressOf, rejectIfRateLimited } from '../clientRateLimit';
import { type JsonBodyLimits, readJsonBody } from '../requestBody';
import { HttpStatus, sendJson } from '../responses';
import type { PublicRoute } from '../routing';

export interface PairRouteDependencies {
  readonly codes: PairingCodes;
  readonly devices: DeviceRegistry;
  readonly failureLimiter: FailureRateLimiter;
  readonly limits: JsonBodyLimits;
  readonly logger: Logger;
}

interface PairRequest {
  readonly secret: string;
  readonly deviceName: string;
}

/**
 * `POST /api/v1/pair` (PROTOCOL.md section 4.4). Authenticated by the one-time secret from the
 * QR code instead of a token: this is how a phone gets its token.
 */
export function pairRoute(dependencies: PairRouteDependencies): PublicRoute {
  return {
    method: 'POST',
    path: ApiPath.pair,
    access: 'public',
    acceptsBody: true,
    handle: async ({ request, response }) => {
      const client = clientAddressOf(request);
      rejectIfRateLimited(dependencies.failureLimiter, client);
      let deviceName: string;
      try {
        deviceName = await redeemPairingCode(request, response, dependencies);
      } catch (error) {
        dependencies.failureLimiter.recordFailure(client);
        dependencies.logger.warn('pairing rejected', { client });
        throw error;
      }
      const { device, token } = await dependencies.devices.register(deviceName);
      dependencies.logger.info('device paired', { device: device.name });
      sendJson(response, HttpStatus.created, { token });
    },
  };
}

/**
 * Checks the request and uses up the pairing code; returns the cleaned device name. Every
 * check that can fail without the secret runs first, so a malformed request never uses up the
 * user's code.
 */
async function redeemPairingCode(
  request: IncomingMessage,
  response: ServerResponse,
  { codes, limits }: PairRouteDependencies,
): Promise<string> {
  // Without a QR code on screen the endpoint is closed, and the body is not even read.
  if (!codes.isActive()) {
    throw new ProtocolError('pairing_rejected');
  }
  const { secret, deviceName } = parsePairRequest(await readJsonBody(request, response, limits));
  if (!codes.redeem(secret)) {
    throw new ProtocolError('pairing_rejected');
  }
  return deviceName;
}

function parsePairRequest(body: unknown): PairRequest {
  if (!isRecord(body)) {
    throw new ProtocolError('invalid_request');
  }
  const { secret, deviceName } = body;
  if (typeof secret !== 'string' || typeof deviceName !== 'string') {
    throw new ProtocolError('invalid_request');
  }
  const cleanName = sanitizeDisplayName(deviceName);
  if (cleanName === '') {
    throw new ProtocolError('invalid_request');
  }
  return { secret, deviceName: cleanName };
}
