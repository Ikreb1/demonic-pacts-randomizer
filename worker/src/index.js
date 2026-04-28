export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (!url.pathname.startsWith('/runelite/player/')) {
      return new Response('demonic-pacts-randomizer wikisync proxy', {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const target = `https://sync.runescape.wiki${url.pathname}`;
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'demonic-pacts-randomizer-proxy' },
    });

    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
