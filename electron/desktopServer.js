const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const APP_BASE_PATH = '/web';
const DEFAULT_DESKTOP_PORT = Number.parseInt(
  process.env.ELECTRON_DESKTOP_PORT || '64740',
  10
);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function stripHopByHopHeaders(headers) {
  const nextHeaders = { ...headers };

  [
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
  ].forEach((header) => {
    delete nextHeaders[header];
  });

  return nextHeaders;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function serveFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[extension] || 'application/octet-stream';

  response.writeHead(200, { 'Content-Type': mimeType });
  fs.createReadStream(filePath).pipe(response);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on('end', () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : null);
    });

    request.on('error', reject);
  });
}

async function proxyRequest(request, response, backendUrl) {
  const targetUrl = new URL(request.url, backendUrl);
  const headers = stripHopByHopHeaders(request.headers);
  const method = request.method || 'GET';

  try {
    const requestBody =
      method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
        ? null
        : await readRequestBody(request);

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body: requestBody ?? undefined,
      redirect: 'manual'
    });

    const responseHeaders = {};

    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        return;
      }

      if (key.toLowerCase() === 'content-length') {
        return;
      }

      responseHeaders[key] = value;
    });

    if (typeof upstream.headers.getSetCookie === 'function') {
      const cookies = upstream.headers.getSetCookie();

      if (cookies.length > 0) {
        responseHeaders['set-cookie'] = cookies;
      }
    }

    response.writeHead(upstream.status, responseHeaders);

    if (upstream.body) {
      const stream = upstream.body;
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        response.write(Buffer.from(value));
      }
    }

    response.end();
  } catch (error) {
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        detail: 'Tracklet desktop proxy could not reach the backend',
        error: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

function resolveStaticPath(staticDir, requestPath) {
  const relativePath = requestPath.startsWith(APP_BASE_PATH)
    ? requestPath.slice(APP_BASE_PATH.length)
    : requestPath;
  const normalizedPath = relativePath === '/' ? '/index.html' : relativePath;
  const resolvedPath = path.normalize(normalizedPath).replace(/^([.][.][/\\])+/, '');
  return path.join(staticDir, resolvedPath);
}

async function startDesktopServer({ staticDir, backendUrl }) {
  const normalizedBackendUrl = backendUrl.replace(/\/+$/, '');
  const indexPath = path.join(staticDir, 'index.html');

  if (!fileExists(indexPath)) {
    throw new Error(`Packaged frontend not found at ${indexPath}`);
  }

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname;

    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/auth/') ||
      pathname.startsWith('/media/') ||
      pathname.startsWith('/static/')
    ) {
      await proxyRequest(request, response, normalizedBackendUrl);
      return;
    }

    if (pathname === '/' || pathname === APP_BASE_PATH) {
      response.writeHead(302, { Location: `${APP_BASE_PATH}/` });
      response.end();
      return;
    }

    const staticPath = resolveStaticPath(staticDir, pathname);

    if (fileExists(staticPath)) {
      serveFile(response, staticPath);
      return;
    }

    serveFile(response, indexPath);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(DEFAULT_DESKTOP_PORT, '127.0.0.1', resolve);
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine desktop server address');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    frontendUrl: `http://127.0.0.1:${address.port}${APP_BASE_PATH}/`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

module.exports = {
  startDesktopServer
};
