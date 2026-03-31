/**
 * PhotoModerator - AI-powered image content moderation via Sightengine REST API.
 * If SIGHTENGINE_API_USER and SIGHTENGINE_API_SECRET are not set, skips check (fail-open).
 * 
 * Detection models: nudity, wad (weapons/alcohol/drugs), offensive (hate symbols)
 * Free tier: 2,000 checks/month — https://sightengine.com
 */

const https = require('https');
const { URL } = require('url');

const API_USER = process.env.SIGHTENGINE_API_USER;
const API_SECRET = process.env.SIGHTENGINE_API_SECRET;

/**
 * Performs a GET request to Sightengine and returns parsed JSON.
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Sightengine')); }
      });
    }).on('error', reject);
  });
}

/**
 * Analyzes an image URL for inappropriate content.
 * Returns { safe: boolean, reason: string }
 * @param {string} imageUrl - Publicly accessible image URL
 */
async function analyzePhoto(imageUrl) {
  // Graceful skip if credentials not configured
  if (!API_USER || !API_SECRET) {
    console.warn('[PhotoModerator] Sightengine credentials not set — skipping image check.');
    return { safe: true, reason: 'no_credentials' };
  }

  if (!imageUrl || !imageUrl.startsWith('http')) {
    return { safe: true, reason: 'no_image' };
  }

  try {
    const params = new URLSearchParams({
      url: imageUrl,
      models: 'nudity-2.0,wad,offensive',
      api_user: API_USER,
      api_secret: API_SECRET,
    });

    const apiUrl = `https://api.sightengine.com/1.0/check.json?${params.toString()}`;
    const result = await httpsGet(apiUrl);

    if (result.status !== 'success') {
      console.error('[PhotoModerator] API error:', result);
      return { safe: true, reason: 'api_error' }; // fail-open
    }

    const nudity = result.nudity;
    const wad = result.weapon || result.alcohol || result.drugs;
    const offensive = result.offensive;

    // Nudity thresholds
    if (nudity) {
      if ((nudity.sexual_activity ?? 0) > 0.6) return { safe: false, reason: 'Immagine con contenuto sessuale esplicito.' };
      if ((nudity.sexual_display ?? 0) > 0.6) return { safe: false, reason: 'Immagine con contenuto sessuale.' };
      if ((nudity.erotica ?? 0) > 0.7) return { safe: false, reason: 'Immagine con contenuto erotico.' };
    }

    // Weapons / drugs threshold
    if (wad && ((result.weapon?.classes?.firearm ?? 0) > 0.7 || (result.drugs?.any ?? 0) > 0.7)) {
      return { safe: false, reason: 'Immagine con armi o droghe.' };
    }

    // Offensive content
    if (offensive && (offensive.prob ?? 0) > 0.7) {
      return { safe: false, reason: 'Immagine con contenuto offensivo.' };
    }

    return { safe: true, reason: 'ok' };

  } catch (err) {
    console.error('[PhotoModerator] Request failed:', err.message);
    return { safe: true, reason: 'request_error' }; // fail-open
  }
}

module.exports = { analyzePhoto };
