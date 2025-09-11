export function GET() {
  const body = [
    'User-agent: *',
    'Disallow: /*?*',
    'Allow: /',
    'Sitemap: https://o-zz.net/sitemap.xml',
  ].join('\n')
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } })
}