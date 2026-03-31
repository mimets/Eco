/**
 * DeepModerator - Advanced AI-like content moderation for Italian
 * Handles: Profanity, Blasphemy, Leet-speak, Spacing Bypasses, and Phonetic Variations.
 */

const RELIGIOUS_SUBJECTS = ['dio', 'madonna', 'gesu', 'cristo', 'padrepio', 'spiritosanto', 'papa', 'allah', 'maometto'];
const INSULTS = ['porco', 'cane', 'maiale', 'boia', 'ladro', 'schifoso', 'lurido', 'bestia', 'stronzo', 'cazzo', 'merda', 'puttana', 'troia', 'schifo'];

const BANNED_PATTERNS = [
  /\b(vaffanculo|stronz[oaei]|cazz[oaie]|merd[ae]|puttan[ae]|troi[ae])\b/i,
  /\b(negr[oaie]|frocio|finocchio|ricchion[ei]|handicappat[oaie]|ritardat[oaie])\b/i,
  /\b(coglion[ei]|pompino|segone|bocchino)\b/i,
  /\b(bastard[oaie]|zoccol[ae]|mignott[ae])\b/i
];

/**
 * Normalizes text to bypass common obfuscation
 */
function normalize(text) {
  if (!text) return '';
  let n = text.toLowerCase();
  
  // Replace leet-speak
  const leet = {'0':'o', '1':'i', '3':'e', '4':'a', '5':'s', '7':'t', '8':'b', '@':'a', '$':'s', '!':'i'};
  n = n.replace(/[0-9@$!]/g, c => leet[c] || c);
  
  // Remove accents
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Remove ALL non-alphanumeric (removes spaces, dots, etc.)
  n = n.replace(/[^a-z]/g, '');
  
  return n;
}

/**
 * Checks for blasphemy
 */
function checkBlasphemy(text) {
  const norm = normalize(text);
  if (norm.length < 5) return false;

  for (const s of RELIGIOUS_SUBJECTS) {
    for (const i of INSULTS) {
      if (norm.includes(s + i) || norm.includes(i + s)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Main validation function (BLOCKING)
 */
function isProfane(text) {
  if (!text) return false;
  
  // 1. Check blasphemy (blocking)
  if (checkBlasphemy(text)) return true;

  // 2. Check standard banned patterns on raw text
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // 3. Check patterns on normalized text (catches p.u.t.t.a.n.a)
  const norm = normalize(text);
  const normalizedBanned = [
    'vaffanculo', 'puttana', 'troia', 'cazzo', 'merda', 'stronzo', 'coglion', 
    'frocio', 'negro', 'ricchion', 'pompino', 'bocchino', 'bastardo'
  ];
  if (normalizedBanned.some(b => norm.includes(b))) return true;

  return false;
}

/**
 * Filters text (SANITIZATION) - now more aggressive
 */
function sanitize(text) {
  if (!text) return text;
  let sanitized = text;
  
  // If isProfane is true, but we want to sanitize for display instead of blocking
  // (though the plan is to move to blocking for everything)
  const wordsToCensor = [
    'cazzo', 'merda', 'puttana', 'stronzo', 'madonna', 'dio', 'gesu', 'boia', 
    'troia', 'vaffanculo', 'bastardo', 'coglione', 'negro', 'frocio'
  ];
  
  for (const w of wordsToCensor) {
    const reg = new RegExp('\\b' + w + '[a-z]*\\b', 'gi');
    sanitized = sanitized.replace(reg, (match) => '*'.repeat(match.length));
  }
  
  return sanitized;
}

module.exports = { isProfane, sanitize };
