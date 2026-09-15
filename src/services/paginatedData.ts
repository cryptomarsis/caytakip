export type CollectionFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T[];
};

type AuthFetch = (url: string, options?: RequestInit, timeout?: number) => Promise<Response>;

const withQuery = (url: string, params: Record<string, string | number | undefined>) => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
    .join('&');
  if (!query) return url;
  return url + (url.includes('?') ? '&' : '?') + query;
};

export const fetchCursorCollection = async <T extends { _id?: string }>(
  authFetch: AuthFetch,
  url: string,
  options: RequestInit = {},
  pageSize = 500,
  maxPages = 100,
): Promise<CollectionFetchResult<T>> => {
  const records: T[] = [];
  const seen = new Set<string>();
  let before = '';

  for (let page = 0; page < maxPages; page += 1) {
    const response = await authFetch(withQuery(url, { limit: pageSize, before }), options);
    if (!response.ok) return { ok: false, status: response.status, data: records };

    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload) || payload.some(row => !row || typeof row !== 'object' || typeof row._id !== 'string' || !row._id)) return { ok: false, status: 502, data: [] };
    const rows = payload as T[];
    for (const row of rows) {
      if (seen.has(row._id!)) return { ok: false, status: 502, data: [] };
      seen.add(row._id!);
    }
    records.push(...rows);

    if (rows.length < pageSize) return { ok: true, status: response.status, data: records };
    const nextBefore = String(rows[rows.length - 1]?._id || '');
    if (!nextBefore || nextBefore === before) return { ok: false, status: 502, data: [] };
    before = nextBefore;
  }

  return { ok: false, status: 502, data: [] };
};

export const fetchArrayCollection = async <T>(
  authFetch: AuthFetch,
  url: string,
  options: RequestInit = {},
): Promise<CollectionFetchResult<T>> => {
  const response = await authFetch(url, options);
  if (!response.ok) return { ok: false, status: response.status, data: [] };
  const payload = await response.json().catch(() => null);
  return Array.isArray(payload) && payload.every(row => row && typeof row === 'object' && !Array.isArray(row) && typeof row._id === 'string' && row._id) ? { ok: true, status: response.status, data: payload as T[] } : { ok: false, status: 502, data: [] };
};
