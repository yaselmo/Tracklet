import { useLocalState } from '../states/LocalState';

const BACKEND_PATH_PREFIXES = ['/api/', '/auth/', '/media/', '/static/'];

function isBackendPath(pathname: string): boolean {
  return BACKEND_PATH_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)
  );
}

function stripFrontendBase(pathname: string): string {
  if (pathname.startsWith('/web/')) {
    const webPath = pathname.slice('/web'.length);

    if (isBackendPath(webPath)) {
      return webPath;
    }
  }

  return pathname;
}

function normalizeReference(url: string, image: boolean): string {
  let reference = url.trim().replaceAll('\\', '/');

  // A backend resource must always be rooted at the server origin. Otherwise,
  // a relative `media/...` path can be resolved below Electron's `/web/` route.
  if (!/^[a-z][a-z\d+.-]*:/i.test(reference) && !reference.startsWith('//')) {
    const pathname = reference.startsWith('/') ? reference : `/${reference}`;
    const normalizedPath = stripFrontendBase(pathname);

    if (isBackendPath(normalizedPath)) {
      return normalizedPath + reference.slice(pathname.length);
    }

    if (image) {
      // Some historical records contain only the stored media filename.
      return `/media/${reference.replace(/^\/+/, '')}`;
    }
  }

  return reference;
}

function normalizeAbsoluteBackendUrl(url: URL, host: string): string {
  const pathname = stripFrontendBase(url.pathname);

  // Media, static, API, and auth URLs are all served by the configured backend
  // (or Electron's local backend proxy). Rebase them so old absolute localhost
  // URLs continue to work after switching environments.
  if (isBackendPath(pathname) && host) {
    try {
      const activeHost = new URL(host);
      const localBackend = ['localhost', '127.0.0.1', '[::1]'].includes(
        url.hostname.toLowerCase()
      );

      // Rebase known local backend URLs (and URLs already using the active
      // host), while leaving unrelated absolute storage URLs such as S3 intact.
      if (localBackend || url.origin === activeHost.origin) {
        return new URL(
          `${pathname}${url.search}${url.hash}`,
          activeHost
        ).toString();
      }
    } catch {
      // Fall through and return the original absolute URL below.
    }
  }

  return url.toString();
}

/**
 * Returns the edit view URL for a given model type
 */
export function generateUrl(url: string | URL, base?: string): string {
  const { getHost } = useLocalState.getState();

  const host: string = getHost();
  const reference = normalizeReference(url.toString(), false);

  try {
    const activeHost = base || host || window.location.origin;
    const resolved = new URL(reference, activeHost);

    if (isBackendPath(stripFrontendBase(resolved.pathname))) {
      return normalizeAbsoluteBackendUrl(resolved, activeHost);
    }

    return resolved.toString();
  } catch (e: any) {
    console.error(`ERR: generateURL failed. url='${url}', base='${base}'`);
  }

  return reference;
}

/**
 * Resolve an image URL against the active backend/media host.
 *
 * Image values have historically been returned as root-relative media URLs,
 * `media/...`, absolute backend URLs, or bare stored filenames. Normalize all
 * of those forms before resolving them so browser and Electron renderers use
 * the same request URL.
 */
export function resolveImageUrl(
  url: string | URL | null | undefined,
  base?: string
): string {
  if (!url) {
    return '';
  }

  const reference = normalizeReference(url.toString(), true);

  if (/^(data:|blob:|file:)/i.test(reference)) {
    return reference;
  }

  return generateUrl(reference, base);
}
