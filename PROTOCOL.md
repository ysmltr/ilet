# ilet wire protocol

This document is the contract between the ilet desktop app (the **server**) and the ilet iOS
app and Share Extension (the **client**). Both sides define their protocol constants in one
place (`desktop/src/protocol/constants.ts`, and later the iOS equivalent). Those constants must
match the values in this document.

The key words MUST, MUST NOT, SHOULD and MAY are used as described in RFC 2119.

## 1. Overview

```
 iPhone (client)                                   PC (server)
 ───────────────                                   ───────────
 1. scan QR code  ◄──────── screen ────────────── "Pair new device"
 2. POST /api/v1/pair  ─── pinned HTTPS ────────►  checks one-time secret, issues token
 3. POST /api/v1/files ─── pinned HTTPS + token ─► saves file into the receive folder
 4. browse _ilet._tcp  ◄─── mDNS (LAN only) ─────  advertises device ID and name
```

- There are no accounts, no cloud servers and no relays. Both devices must be on the same local
  network.
- The client always starts the connection. The server never connects to the client.

## 2. Transport

| Item                | Value                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Protocol            | HTTP/1.1 over TLS. There is no plaintext port.                                           |
| Default port        | `45380` (on a phone keypad, 4-5-3-8 spells I-L-E-T)                                      |
| TLS versions        | TLS 1.3 preferred; TLS 1.2 allowed only with the cipher suites below                     |
| TLS 1.2 suites      | `ECDHE-ECDSA-AES128-GCM-SHA256`, `ECDHE-ECDSA-AES256-GCM-SHA384`, `ECDHE-ECDSA-CHACHA20-POLY1305` |
| Address             | Clients MUST connect to an IP literal, never to a host name                              |

### 2.1 Server certificate

On first launch the server creates a long-lived identity:

| Field                 | Value                                                                           |
| --------------------- | ------------------------------------------------------------------------------- |
| Key                   | ECDSA P-256                                                                      |
| Signature             | ecdsa-with-SHA256, self-signed                                                   |
| Subject / issuer      | `CN=ilet`                                                                        |
| Validity              | from creation time until `99991231235959Z` ("no well-defined expiration", RFC 5280 §4.1.2.5) |
| Extensions            | basicConstraints `CA:FALSE` (critical), extendedKeyUsage `serverAuth`, subjectAltName `DNS:localhost, IP:127.0.0.1, IP:::1` |

The subject alternative names exist only so that standard tools (for example `curl --cacert`)
can verify the certificate during local development. **Clients MUST NOT use host name
validation or the system trust store.** Trust comes only from the pin.

### 2.2 Certificate pinning

- The **fingerprint** is the SHA-256 hash of the DER-encoded leaf certificate, written as 64
  lowercase hexadecimal characters.
- The client receives the fingerprint out of band, inside the pairing QR code (section 4).
- For every connection, including background uploads from the app and the Share Extension, the
  client MUST compute the fingerprint of the leaf certificate the server presents and compare it with the
  pinned value. If they differ, the client MUST abort the connection, MUST NOT send any request
  data (including the token), and MUST show a clear warning. There is no "continue anyway"
  option.

## 3. Common HTTP rules

These rules apply to every endpoint.

| Rule                 | Behaviour                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Origin` header      | Any request that carries an `Origin` header is rejected with `403 forbidden`.                              |
| `Host` header        | Must be an IP literal (`192.168.1.20`, `[fe80::1]`) or `localhost`, with an optional port. Otherwise `403 forbidden`. |
| Request target       | Must be origin-form (`/api/...`). Query strings are not used and are ignored.                              |
| Unknown path         | `404 not_found`                                                                                             |
| Known path, wrong method | `405 method_not_allowed`, with an `Allow` header                                                       |
| Body on a route without a body | `413 payload_too_large`                                                                          |
| Error responses      | Always close the connection (`Connection: close`).                                                         |
| Response headers     | `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'` |
| Client source address| The server drops connections from addresses outside local-network ranges (RFC 1918, link-local, loopback, IPv6 ULA) before the TLS handshake. |
| Public networks      | On Windows, the server accepts connections only on its addresses on networks that Windows classifies as Private (and on loopback). Connections to any other address, on a Public or Domain network or one not classified yet, are dropped before the TLS handshake. |

### 3.1 Authentication

| Endpoint            | Authentication                                       |
| ------------------- | ---------------------------------------------------- |
| `GET /api/info`     | none                                                 |
| `POST /api/v1/pair` | one-time pairing secret in the request body          |
| everything else     | access token: `Authorization: Bearer <token>`        |

- An **access token** is 32 random bytes encoded as base64url without padding (43 characters).
- The server stores only the SHA-256 hash of each token and compares hashes in constant time.
- A missing, malformed, unknown or revoked token gives `401 unauthorized` with
  `WWW-Authenticate: Bearer`.
- **Rate limit:** after 10 failed authentications from one client address within 60 seconds,
  that address gets `429 too_many_requests` with a `Retry-After` header (seconds) until the
  window ends.
  Requests from a blocked address are not checked at all.
- Authentication happens before the server reads any request body.

### 3.2 Errors

Every error response has this body:

```json
{ "error": "<code>" }
```

The body never contains messages, stack traces, paths or other internal details. Clients map
the code to a localized message.

| Code                     | HTTP | Meaning                                                              |
| ------------------------ | ---- | -------------------------------------------------------------------- |
| `invalid_request`        | 400  | Malformed request (bad header value, bad JSON)                       |
| `incomplete_upload`      | 400  | The body ended before `Content-Length` bytes arrived                 |
| `unauthorized`           | 401  | Missing, invalid or revoked access token                             |
| `forbidden`              | 403  | `Origin` header present, or `Host` is not an IP literal              |
| `pairing_rejected`       | 403  | Wrong, expired or already used pairing secret                        |
| `not_found`              | 404  | Unknown path                                                         |
| `method_not_allowed`     | 405  | Known path, wrong method                                             |
| `length_required`        | 411  | Upload without `Content-Length` (chunked uploads are not supported)  |
| `payload_too_large`      | 413  | File larger than the limit, or a body where none is allowed          |
| `unsupported_media_type` | 415  | Wrong `Content-Type`                                                 |
| `too_many_requests`      | 429  | Rate limited; see `Retry-After`                                      |
| `internal_error`         | 500  | Anything else                                                        |
| `too_many_uploads`       | 503  | Concurrent upload limit reached; see `Retry-After`                   |
| `insufficient_storage`   | 507  | Not enough free disk space on the PC                                 |

### 3.3 Server timeouts and limits

Clients should expect the server to enforce these values:

| Limit                                 | Value      |
| ------------------------------------- | ---------- |
| TLS handshake                         | 10 s       |
| Receiving the request headers         | 10 s       |
| Idle connection (no bytes either way) | 30 s       |
| Keep-alive between requests           | 5 s        |
| Total size of request headers         | 16 KiB     |
| Simultaneous connections              | 32         |
| JSON request body                     | 4 KiB, complete within 10 s |
| File size                             | configurable, default 8 GiB |
| Concurrent uploads (all devices)      | configurable, default 4     |

## 4. Pairing

Pairing happens only by scanning a QR code that the desktop shows after the user clicks
"Pair new device". There is no manual code entry and no URL scheme.

### 4.1 Pairing secret

- 32 random bytes, base64url without padding (43 characters).
- Valid for 120 seconds. Only one secret exists at a time: creating a new one, closing the QR
  window, or a successful pairing invalidates the previous secret.
- Single use: once a request presents the correct secret, the secret is invalidated, even if
  the rest of the pairing fails.
- Failed pairing attempts count towards the same per-address rate limit as failed
  authentications (section 3.1).
- While no pairing code is on screen, `POST /api/v1/pair` is closed: it answers
  `403 pairing_rejected` without reading the request body.

### 4.2 QR code payload

The QR code contains one line of UTF-8 JSON:

```json
{
  "ilet": 1,
  "id": "6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23",
  "name": "DESKTOP-4F2K",
  "addresses": ["192.168.1.20"],
  "port": 45380,
  "fingerprint": "5d41402abc4b2a76b9719d911017c592ae2f8b2f9c3e1e4f2c1b1a0d9e8f7a6b",
  "secret": "q3Zr0bS8wq3qKk4VQ2Xn0hY5w3m6Jt1oZr8sDpX4u7A"
}
```

| Key           | Type             | Rules                                                                   |
| ------------- | ---------------- | ----------------------------------------------------------------------- |
| `ilet`        | integer          | Payload format version, currently `1`. Also identifies the QR as ilet's. |
| `id`          | string           | Desktop device ID (UUID v4, lowercase)                                  |
| `name`        | string           | Desktop display name, 1–64 UTF-16 code units, without control, format or line separator characters (clients refuse a code that has them) |
| `addresses`   | array of strings | 1–8 IP literals of the desktop in local-network ranges (no link-local IPv6, which needs a zone ID) |
| `port`        | integer          | 1–65535                                                                 |
| `fingerprint` | string           | Certificate fingerprint (section 2.2)                                   |
| `secret`      | string           | Pairing secret (section 4.1)                                            |

The client MUST reject the payload if any rule fails. It MUST ignore unknown keys.

The JSON contains no whitespace (the example is formatted for reading). The QR code uses error
correction level M and a quiet zone of four modules. Addresses are listed most likely first:
IPv4 before IPv6, and physical network adapters before virtual ones (Hyper-V, WSL, VirtualBox,
VMware).

### 4.3 Pairing flow

1. The client parses and validates the QR payload.
2. It connects to `https://<address>:<port>` with the pin from `fingerprint`, trying the
   addresses in order or in parallel.
3. `GET /api/info`. The returned `deviceId` MUST equal `id`.
4. `POST /api/v1/pair` (below). On success the client stores the token in the Keychain (in the
   access group shared with the Share Extension) and stores `id`, `name`, `fingerprint`,
   `addresses` and `port` in the App Group.

### 4.4 `POST /api/v1/pair`

Request headers: `Content-Type: application/json`. Body (at most 4 KiB):

```json
{ "secret": "<pairing secret>", "deviceName": "Yeşim's iPhone" }
```

`deviceName` is 1–64 UTF-16 code units. The server removes control and invisible characters.

Success: `201 Created`

```json
{ "token": "<access token>" }
```

The server checks, in this order:

1. Rate limit: `429 too_many_requests`.
2. A pairing code is on screen; otherwise `403 pairing_rejected`, without reading the body.
3. `Content-Type: application/json`, otherwise `415 unsupported_media_type`.
4. `Content-Length` is present and at most 4 KiB: `411 length_required`, `413 payload_too_large`.
5. The body arrives within 10 seconds (otherwise the connection is closed) and is a JSON object
   with the string fields `secret` and `deviceName`, and the cleaned `deviceName` is not empty:
   `400 invalid_request`. Unknown fields are ignored.
6. The secret matches and has not expired: `403 pairing_rejected`.

Steps 1–5 never use up the pairing code; only a successful step 6 does. Every failed attempt
counts towards the rate limit.

The desktop then shows which device was paired, so the user notices an unexpected pairing and
can revoke it.

## 5. Endpoints

### 5.1 `GET /api/info`

No authentication. Used to check the protocol version and that the right desktop answered.

`200 OK`

```json
{ "protocolVersion": 1, "deviceId": "6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23", "displayName": "DESKTOP-4F2K" }
```

This endpoint is not versioned. If the client does not support `protocolVersion`, it MUST stop
and ask the user to update ilet.

### 5.2 `GET /api/v1/status`

Access token required. Used to check that the pairing is still valid and to read the limits
before uploading.

`200 OK`

```json
{
  "pairedDevice": { "id": "0b9c6a51-1f0e-4f35-a3e5-1b2c3d4e5f60", "name": "Yeşim's iPhone" },
  "limits": { "maxFileSizeBytes": 8589934592, "maxConcurrentUploads": 4 }
}
```

### 5.3 `POST /api/v1/files`

Access token required. The request body is the raw file content (not multipart).

| Header           | Rule                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| `Authorization`  | `Bearer <token>`                                                           |
| `Content-Type`   | `application/octet-stream`                                                 |
| `Content-Length` | Required. Chunked transfer encoding is not supported.                      |
| `Ilet-File-Name` | Required, exactly once. The file name as UTF-8, percent-encoded (like JavaScript `encodeURIComponent`). |
| `Expect`         | Optional `100-continue`. The server sends `100 Continue` only after all checks below pass. |

The server checks, in this order: authentication, `Content-Length`, `Content-Type`, file name
header, file size limit, concurrent upload limit, free disk space.

`201 Created`

```json
{ "fileName": "IMG_0001 (1).JPG" }
```

`fileName` is the final name on the PC. It can differ from the requested name because the
server:

- removes path components, control and invisible Unicode characters (for example
  right-to-left overrides) and characters Windows does not allow, trims trailing dots and
  spaces, prefixes Windows device names (`CON` → `_CON`) and shortens long names;
- uses a generated name (`ilet-YYYYMMDD-HHMMSS`) when nothing valid remains;
- appends `.txt` to file types that Windows Explorer reads automatically when it shows a folder
  (`.lnk`, `.url`, `.scf`, `.library-ms`, `.searchconnector-ms`, `.theme`, `.themepack`,
  `.desktopthemepackfile`, `desktop.ini`), because they can make Windows connect to other
  computers;
- never overwrites a file: it appends ` (1)`, ` (2)`, … before the extension.

Errors: `400 invalid_request`, `400 incomplete_upload`, `401 unauthorized`,
`411 length_required`, `413 payload_too_large`, `415 unsupported_media_type`,
`429 too_many_requests`, `503 too_many_uploads`, `507 insufficient_storage`.

If the connection breaks during an upload, the server deletes the partial data. Clients should
read `limits` from `/api/v1/status` first, so that they don't start uploads the server will
reject.

## 6. Discovery

The desktop advertises a DNS-SD service (RFC 6763) over Multicast DNS (RFC 6762) on the local
network, so that a phone can find a paired PC again after its IP address changes:

| Item          | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Service type  | `_ilet._tcp`                                                                          |
| Instance name | The display name, with dots replaced by spaces and shortened to fit one DNS label (at most 57 bytes of UTF-8, which leaves room for a rename). If another device already uses the name, it becomes `<name> (2)`, `<name> (3)`, …. Informational only. |
| Host name     | `ilet-` and the first 8 characters of the device ID, for example `ilet-6f1c2a8e.local`: a name of its own, so it never clashes with the name Windows announces for the PC |
| Port          | The server port                                                                       |
| TXT `id`      | Desktop device ID                                                                     |
| TXT `name`    | Desktop display name, 1–64 UTF-16 code units                                          |

The TXT record contains nothing else. The desktop announces the service only while its server
listens on the network (the development scripts listen on `127.0.0.1` and announce nothing), and
on Windows only on networks classified as Private, never on Public or Domain ones. It receives
queries on UDP port 5353 and sends goodbye packets (TTL 0) when it stops.

Anyone on the network can advertise any service with any TXT record. The client therefore uses
discovery only to find a new address and port for a desktop it already paired with, matched by
`id`:

- It MUST check every resolved address against the rules for the QR code's `addresses`
  (section 4.2) and connect only to IP literals (section 2).
- It MUST still pin the certificate (section 2.2). Trust comes only from the pin, so a fake
  announcement can at worst make a connection fail.

## 7. Implementation status

| Part                                   | Desktop | iOS     |
| -------------------------------------- | ------- | ------- |
| Transport, certificate, common rules   | Phase 1 | Phase 3 |
| `GET /api/info`, `GET /api/v1/status`  | Phase 1 | Phase 3 |
| `POST /api/v1/files`                   | Phase 1 | Phase 3 |
| Pairing (QR, `POST /api/v1/pair`)      | Phase 2 | Phase 3 |
| Discovery                              | Phase 4 | Phase 4 (not written yet) |
| No connections or announcements outside Private networks | Phase 6, 7 | – |
