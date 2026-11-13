/**
 * UFC Quiz Proxy Worker - Secured Version
 *
 * Security features:
 * - API key stored as secret (never exposed)
 * - Strict origin enforcement
 * - Rate limiting per IP
 * - Input validation & sanitization
 * - Payload size limits
 * - Cached responses to reduce upstream API calls
 */

// Allowed origins - STRICT enforcement
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://ufcapi.aristotle.me',
  'https://ufc.aristotle.me',
];

// Rate limiting config
const RATE_LIMIT = {
  WINDOW_MS: 60000,        // 1 minute window
  MAX_REQUESTS: 30,        // Max 30 requests per minute per IP
  RECORD_MAX: 10,          // Max 10 quiz submissions per minute per IP
};

// Cache config
const CACHE_TTL = 3600; // 1 hour cache for fighters data

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // ============ SECURITY: Origin Check ============
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);
    const isDirectAccess = !origin; // Allow direct browser/curl access for testing

    // For POST requests, strictly enforce origin
    if (request.method === 'POST' && !isAllowedOrigin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const corsOrigin = isAllowedOrigin ? origin : (isDirectAccess ? '*' : ALLOWED_ORIGINS[0]);

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ============ SECURITY: Rate Limiting ============
    const rateLimitKey = `ratelimit:${clientIP}:${Math.floor(Date.now() / RATE_LIMIT.WINDOW_MS)}`;

    if (env.STATS) {
      try {
        const currentCount = parseInt(await env.STATS.get(rateLimitKey) || '0');
        const limit = path === '/api/stats/record' ? RATE_LIMIT.RECORD_MAX : RATE_LIMIT.MAX_REQUESTS;

        if (currentCount >= limit) {
          return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': '60'
            }
          });
        }

        // Increment rate limit counter (fire and forget)
        env.STATS.put(rateLimitKey, String(currentCount + 1), { expirationTtl: 120 });
      } catch (e) {
        // Rate limiting failed, continue anyway
        console.log('Rate limit check failed:', e.message);
      }
    }

    try {
      // ============ STATS ENDPOINTS ============

      // Record a quiz result
      if (path === '/api/stats/record' && request.method === 'POST') {
        if (!env.STATS) {
          return new Response(JSON.stringify({ error: 'Stats storage not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check content length (max 1KB)
        const contentLength = parseInt(request.headers.get('Content-Length') || '0');
        if (contentLength > 1024) {
          return new Response(JSON.stringify({ error: 'Payload too large' }), {
            status: 413,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { fighterSlug, fighterName } = body;

        // Validate fighterSlug (alphanumeric and hyphens only, max 100 chars)
        if (!fighterSlug || typeof fighterSlug !== 'string') {
          return new Response(JSON.stringify({ error: 'fighterSlug required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const sanitizedSlug = fighterSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100);
        const sanitizedName = fighterName ? String(fighterName).slice(0, 100) : sanitizedSlug;

        if (!sanitizedSlug) {
          return new Response(JSON.stringify({ error: 'Invalid fighterSlug' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get current stats
        let stats = await env.STATS.get('quiz_stats', 'json') || {
          totalQuizzes: 0,
          fighterCounts: {},
          fighterNames: {},
          lastUpdated: null
        };

        // Increment counts
        stats.totalQuizzes += 1;
        stats.fighterCounts[sanitizedSlug] = (stats.fighterCounts[sanitizedSlug] || 0) + 1;
        stats.fighterNames[sanitizedSlug] = sanitizedName;
        stats.lastUpdated = new Date().toISOString();

        // Save back to KV
        await env.STATS.put('quiz_stats', JSON.stringify(stats));

        return new Response(JSON.stringify({
          success: true,
          totalQuizzes: stats.totalQuizzes,
          fighterCount: stats.fighterCounts[sanitizedSlug]
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get all stats (public, cached)
      if (path === '/api/stats' && request.method === 'GET') {
        if (!env.STATS) {
          return new Response(JSON.stringify({
            totalQuizzes: 0,
            topFighters: [],
            message: 'Stats storage not configured yet'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let stats = await env.STATS.get('quiz_stats', 'json') || {
          totalQuizzes: 0,
          fighterCounts: {},
          fighterNames: {},
          lastUpdated: null
        };

        const topFighters = Object.entries(stats.fighterCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([slug, count]) => ({
            slug,
            name: stats.fighterNames[slug] || slug,
            count,
            percentage: stats.totalQuizzes > 0
              ? ((count / stats.totalQuizzes) * 100).toFixed(1)
              : 0
          }));

        return new Response(JSON.stringify({
          totalQuizzes: stats.totalQuizzes,
          topFighters,
          lastUpdated: stats.lastUpdated
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30' // Cache for 30 seconds
          }
        });
      }

      // Get stats for specific fighter
      if (path.startsWith('/api/stats/fighter/') && request.method === 'GET') {
        const fighterSlug = path.replace('/api/stats/fighter/', '').toLowerCase().replace(/[^a-z0-9-]/g, '');

        if (!env.STATS || !fighterSlug) {
          return new Response(JSON.stringify({
            fighterSlug,
            count: 0,
            percentage: '0',
            totalQuizzes: 0
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let stats = await env.STATS.get('quiz_stats', 'json') || {
          totalQuizzes: 0,
          fighterCounts: {},
          fighterNames: {}
        };

        const fighterCount = stats.fighterCounts[fighterSlug] || 0;
        const percentage = stats.totalQuizzes > 0
          ? ((fighterCount / stats.totalQuizzes) * 100).toFixed(1)
          : '0';

        const sortedFighters = Object.entries(stats.fighterCounts)
          .sort((a, b) => b[1] - a[1]);
        const rank = sortedFighters.findIndex(([slug]) => slug === fighterSlug) + 1;

        return new Response(JSON.stringify({
          fighterSlug,
          fighterName: stats.fighterNames[fighterSlug] || fighterSlug,
          count: fighterCount,
          percentage,
          rank: rank || null,
          totalFighters: sortedFighters.length,
          totalQuizzes: stats.totalQuizzes
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30'
          }
        });
      }

      // ============ UFC API PROXY (Protected) ============

      // Only the exact path the old app used. The upstream URL is fixed, so a
      // caller can neither reach other admin-key endpoints nor poison the cache.
      if (path === '/api/fighters') {
        if (request.method !== 'GET') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!env.UFC_API_KEY) {
          return new Response(JSON.stringify({ error: 'API key not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Try to get cached response first
        const cacheKey = `fighters_cache`;
        if (env.STATS) {
          const cached = await env.STATS.get(cacheKey);
          if (cached) {
            return new Response(cached, {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
                'X-Cache': 'HIT'
              },
            });
          }
        }

        // Forward request to UFC API with API key
        const apiUrl = 'https://ufcapi.aristotle.me/api/fighters?limit=10000';

        const apiResponse = await fetch(apiUrl, {
          headers: {
            'X-API-Key': env.UFC_API_KEY,
            'Content-Type': 'application/json',
          },
        });

        const data = await apiResponse.text();

        // Cache successful responses
        if (apiResponse.ok && env.STATS) {
          env.STATS.put(cacheKey, data, { expirationTtl: CACHE_TTL });
        }

        return new Response(data, {
          status: apiResponse.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'MISS'
          },
        });
      }

      // 404 for unknown routes
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // Don't expose internal error details
      console.log('Worker error:', error.message);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },
};
