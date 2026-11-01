import type { IncomingMessage } from 'node:http';

import type { PairedDevice } from '../../auth/deviceRegistry';
import type { FileReceiver, ReceivedFile } from '../../files/fileReceiver';
import { ApiPath, MediaType, RequestHeader } from '../../protocol/constants';
import { ProtocolError } from '../../shared/errors';
import { readContentLength, requireMediaType, sendContinueIfExpected } from '../requestBody';
import { HttpStatus, sendJson } from '../responses';
import type { PairedDeviceRoute } from '../routing';

export type FileReceivedListener = (file: ReceivedFile, device: PairedDevice) => void;

/** `POST /api/v1/files` (PROTOCOL.md section 5.3): the body is the raw file content. */
export function uploadRoute(
  receiver: FileReceiver,
  onFileReceived: FileReceivedListener,
): PairedDeviceRoute {
  return {
    method: 'POST',
    path: ApiPath.files,
    access: 'paired-device',
    acceptsBody: true,
    handle: async ({ request, response, device }) => {
      const sizeBytes = readContentLength(request);
      requireMediaType(request, MediaType.upload);
      const requestedName = readFileName(request);
      const received = await receiver.receive({
        deviceId: device.id,
        requestedName,
        sizeBytes,
        content: request,
        onAccepted: () => {
          sendContinueIfExpected(request, response);
        },
      });
      sendJson(response, HttpStatus.created, { fileName: received.fileName });
      onFileReceived(received, device);
    },
  };
}

/** Exactly one `Ilet-File-Name` header, percent-encoded UTF-8. */
function readFileName(request: IncomingMessage): string {
  const values = request.headersDistinct[RequestHeader.fileName] ?? [];
  const [encodedName] = values;
  if (values.length !== 1 || encodedName === undefined) {
    throw new ProtocolError('invalid_request');
  }
  try {
    return decodeURIComponent(encodedName);
  } catch (error) {
    throw new ProtocolError('invalid_request', { cause: error });
  }
}
