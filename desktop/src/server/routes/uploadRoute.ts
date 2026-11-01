import type { IncomingMessage, ServerResponse } from 'node:http';

import type { PairedDevice } from '../../auth/deviceRegistry';
import type { FileReceiver, ReceivedFile } from '../../files/fileReceiver';
import { ApiPath, EXPECT_CONTINUE, MediaType, RequestHeader } from '../../protocol/constants';
import { ProtocolError } from '../../shared/errors';
import { HttpStatus, sendJson } from '../responses';
import type { PairedDeviceRoute } from '../routing';

const DECIMAL_DIGITS = /^\d+$/;
const MEDIA_TYPE_PARAMETER_SEPARATOR = ';';

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
      requireUploadContentType(request);
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

/** The size must be known up front for the limit and disk checks, so chunked uploads are refused. */
function readContentLength(request: IncomingMessage): number {
  const contentLength = request.headers[RequestHeader.contentLength];
  if (
    request.headers[RequestHeader.transferEncoding] !== undefined ||
    contentLength === undefined
  ) {
    throw new ProtocolError('length_required');
  }
  if (!DECIMAL_DIGITS.test(contentLength)) {
    throw new ProtocolError('invalid_request');
  }
  const sizeBytes = Number(contentLength);
  if (!Number.isSafeInteger(sizeBytes)) {
    throw new ProtocolError('payload_too_large');
  }
  return sizeBytes;
}

function requireUploadContentType(request: IncomingMessage): void {
  const mediaType = request.headers[RequestHeader.contentType]
    ?.split(MEDIA_TYPE_PARAMETER_SEPARATOR)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== MediaType.upload) {
    throw new ProtocolError('unsupported_media_type');
  }
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

function sendContinueIfExpected(request: IncomingMessage, response: ServerResponse): void {
  if (request.headers[RequestHeader.expect]?.toLowerCase() === EXPECT_CONTINUE) {
    response.writeContinue();
  }
}
