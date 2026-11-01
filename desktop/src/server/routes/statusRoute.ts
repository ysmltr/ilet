import { ApiPath } from '../../protocol/constants';
import { HttpStatus, sendJson } from '../responses';
import type { PairedDeviceRoute } from '../routing';

export interface UploadLimits {
  readonly maxFileSizeBytes: number;
  readonly maxConcurrentUploads: number;
}

/** `GET /api/v1/status` (PROTOCOL.md section 5.2): confirms the pairing and reports limits. */
export function statusRoute(limits: UploadLimits): PairedDeviceRoute {
  return {
    method: 'GET',
    path: ApiPath.status,
    access: 'paired-device',
    acceptsBody: false,
    handle: ({ response, device }) => {
      sendJson(response, HttpStatus.ok, {
        pairedDevice: { id: device.id, name: device.name },
        limits: {
          maxFileSizeBytes: limits.maxFileSizeBytes,
          maxConcurrentUploads: limits.maxConcurrentUploads,
        },
      });
    },
  };
}
