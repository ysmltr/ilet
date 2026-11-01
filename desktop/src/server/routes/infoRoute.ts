import { ApiPath, PROTOCOL_VERSION } from '../../protocol/constants';
import { HttpStatus, sendJson } from '../responses';
import type { PublicRoute } from '../routing';

export interface ServerDescription {
  readonly deviceId: string;
  readonly displayName: string;
}

/** `GET /api/info` (PROTOCOL.md section 5.1): the only route without authentication. */
export function infoRoute({ deviceId, displayName }: ServerDescription): PublicRoute {
  return {
    method: 'GET',
    path: ApiPath.info,
    access: 'public',
    acceptsBody: false,
    handle: ({ response }) => {
      sendJson(response, HttpStatus.ok, {
        protocolVersion: PROTOCOL_VERSION,
        deviceId,
        displayName,
      });
    },
  };
}
