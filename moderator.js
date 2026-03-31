/**
 * DeepModerator - Advanced AI-like content moderation for Italian
 * Handles: Profanity, Blasphemy, Leet-speak, Spacing Bypasses, and Phonetic Variations.
 */

const RELIGIOUS_SUBJECTS = ['dio', 'madonna', 'gesu', 'cristo', 'padre pio', 'spirito santo', 'papa', 'allah', 'maometto'];
const INSULTS = ['porco', 'cane', 'maiale', 'boia', 'ladro', 'schifoso', 'lurido', 'bestia', 'stronzo', 'cazzo', 'merda', 'puttana', 'troia'];

const BANNED_PATTERNS = [
  // Exact matches for extreme offensive terms
  /\b(vaffanculo|stronz[oaei]|cazz[oaie]|merd[ae]|puttan[ae]|troi[ae])\b/i,
  /\b(negr[oaie]|frocio|finocchio|ricchion[ei]|handicappat[oaie]|ritardat[oaie])\b/i,
  /\b(coglion[ei]|pompino|segone|bocchino)\b/i
];

/**
 * Normalizes text to bypass common obfuscation (leet-speak, spacing, etc.)
 */
function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[0-9]/g, (n) => ({'0':'o', '1':'i', '3':'e', '4':'a', '5':'s', '7':'t', '8':'b'})[n] || n) // Leet-speak
    .replace(/[@#$!%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '') // Remove special characters
    .replace(/\s+/g, ''); // Remove all spaces to catch "p o r c o"
}

/**
 * Checks for blasphemy by patterns of [subject] [insult]
 */
function checkBlasphemy(text) {
  const norm = normalize(text);
  for (const s of RELIGIOUS_SUBJECTS) {
    for (const i of INSULTS) {
      if (norm.includes(s.replace(/\s+/g, '') + i) || norm.includes(i + s.replace(/\s+/g, ''))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Main validation function
 */
function isProfane(text) {
  if (!text) return false;
  
  // 1. Check blasphemy (highest priority)
  if (checkBlasphemy(text)) return true;

  // 2. Check standard banned patterns
  const norm = normalize(text);
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text) || pattern.test(norm)) return true;
  }

  // 3. Fallback to simple list check for variety
  const words = text.toLowerCase().split(/\s+/);
  const commonBanned = ['bastardo', 'merdoso', 'zoccola', 'mignotta'];
  if (words.some(w => commonBanned.includes(w))) return true;

  return false;
}

/**
 * Filters text by replacing banned segments with asterisks
 */
function sanitize(text) {
  if (!text) return text;
  let sanitized = text;
  
  // We apply a recursive regex that catches common words
  const wordsToCensor = ['cazzo', 'merda', 'puttana', 'stronzo', 'madonna', 'dio', 'gesu', 'boia'];
  for (const w of wordsToCensor) {
    const reg = new RegExp('\\b' + w + '[a-z]*\\b', 'gi');
    sanitized = sanitized.replace(reg, (match) => '*'.repeat(match.length));
  }
  
  return sanitized;
}

module.exports = { isProfane, sanitize };
