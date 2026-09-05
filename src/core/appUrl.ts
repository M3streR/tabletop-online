export function joinAppUrl(origin: string, baseUrl: string, path = '/') {
  const base = baseUrl === '/' ? '' : `/${baseUrl.replace(/^\/+|\/+$/g, '')}`
  const suffix = `/${path.replace(/^\/+/, '')}`
  return `${origin}${base}${suffix}`
}

export function publicAppUrl(path = '/') {
  return joinAppUrl(window.location.origin, import.meta.env.BASE_URL, path)
}
