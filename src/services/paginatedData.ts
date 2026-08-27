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
  let before = '';

  for (let page = 0; page < maxPages; page += 1) {
    const response = await authFetch(withQuery(url, { limit: pageSize, before }), options);
    if (!response.ok) return { ok: false, status: response.status, data: records };

    const payload = await response.json().catch(() => []);
    const rows = Array.isArray(payload) ? payload as T[] : [];
    records.push(...rows);

    if (rows.length < pageSize) return { ok: true, status: response.status, data: records };
    const nextBefore = String(rows[rows.length - 1]?._id || '');
    if (!nextBefore || nextBefore === before) return { ok: true, status: response.status, data: records };
    before = nextBefore;
  }

  return { ok: true, status: 200, data: records };
};

export const fetchArrayCollection = async <T>(
  authFetch: AuthFetch,
  url: string,
  options: RequestInit = {},
): Promise<CollectionFetchResult<T>> => {
  const response = await authFetch(url, options);
  if (!response.ok) return { ok: false, status: response.status, data: [] };
  const payload = await response.json().catch(() => []);
  return { ok: true, status: response.status, data: Array.isArray(payload) ? payload as T[] : [] };
};