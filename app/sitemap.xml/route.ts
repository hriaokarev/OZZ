const SITE = 'https://o-zz.net'

export async function GET() {
  const now = new Date().toISOString()
  const urls = [
    { loc: `${SITE}/`, lastmod: now },
    { loc: `${SITE}/about`, lastmod: now },
  ]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}