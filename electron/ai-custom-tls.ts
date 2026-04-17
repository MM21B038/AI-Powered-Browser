/**
 * Optional extra PEM CA for HTTPS requests to custom OpenAI-compatible hosts
 * (corporate / self-signed). Merged with Node's default trust store.
 */

import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { URL } from "node:url";

function streamToBuffer(stream: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export type HttpsRequestParts = {
  lib: typeof http | typeof https;
  options: http.RequestOptions;
};

/** Build Node http(s).request options; `tlsCaPem` only affects HTTPS. */
export function buildRequestParts(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  tlsCaPem: string | undefined,
): HttpsRequestParts {
  const u = new URL(urlStr);
  const isHttps = u.protocol === "https:";
  const extra = tlsCaPem?.trim();
  const ca = isHttps && extra ? [...tls.rootCertificates, extra] : undefined;
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80;
  const options: http.RequestOptions = {
    hostname: u.hostname,
    port,
    path: `${u.pathname}${u.search}`,
    method,
    headers,
    ...(ca ? { ca } : {}),
  };
  return { lib: isHttps ? https : http, options };
}

/** Full response body as UTF-8 string (for list models, test hi). */
export async function httpsRequestBody(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  tlsCaPem: string | undefined,
): Promise<{ statusCode: number; body: string }> {
  const { lib, options } = buildRequestParts(url, method, headers, tlsCaPem);
  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      void streamToBuffer(res)
        .then((buf) => {
          resolve({ statusCode: res.statusCode ?? 0, body: buf.toString("utf8") });
        })
        .catch(reject);
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export type HttpsStreamSession = {
  response: http.IncomingMessage;
  /** Abort the in-flight request (stops the response stream). */
  cancel: () => void;
};

/** Stream UTF-8 chunks from response body; caller handles non-2xx before reading body. */
export async function httpsRequestStream(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  tlsCaPem: string | undefined,
): Promise<HttpsStreamSession> {
  const { lib, options } = buildRequestParts(url, method, headers, tlsCaPem);
  return new Promise((resolve, reject) => {
    const req = lib.request(options, (response) => {
      resolve({
        response,
        cancel: () => {
          try {
            req.destroy();
          } catch {
            /* ignore */
          }
        },
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function readErrorBody(res: http.IncomingMessage): Promise<string> {
  const buf = await streamToBuffer(res);
  return buf.toString("utf8");
}
