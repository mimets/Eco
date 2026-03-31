// Import ONLY the BayesClassifier directly to avoid the afinn-165 ESM conflict
const { BayesClassifier } = require('natural');

/**
 * NeuralModerator - A statistical ML classifier for Italian toxicity.
 * Trained on semantic patterns, personal attacks, and aggressive behavior.
 */

const classifier = new BayesClassifier();

// --- TRAINING DATA ---
const toxicSamples = [
  "sei un fallito", "fai schifo", "non vali niente", "devi sparire", "ammazzati",
  "sei inutile", "sei una palla di lardo", "nessuno ti vuole",
  "sparisci dalla faccia della terra", "sei un poveraccio", "fatti schifo da solo",
  "crepa male", "sei uno sfigato", "non capisci niente", "sei un ignorante ridicolo",
  "ti odio", "voglio che muori", "sei la feccia", "gente come te non serve",
  "sei stupido", "sei un cretino", "vai a fanculo", "sei un idiota",
  "non sai fare niente", "sei inutile come sempre"
];

const cleanSamples = [
  "ciao a tutti", "bella giornata oggi", "ho fatto 10km in bici", "che bel panorama",
  "grazie per il consiglio", "ottimo lavoro team", "mi piace questa sfida",
  "andiamo avanti cosi", "salviamo il pianeta", "oggi ho mangiato bene",
  "non sono daccordo ma rispetto la tua opinione", "come si fa a partecipare",
  "buonasera", "grazie mille", "molto interessante",
  "che bel treno", "mi piace correre", "la natura e bellissima", "buona fortuna",
  "ottima idea", "sono daccordo", "possiamo farcela", "grande lavoro"
];

toxicSamples.forEach(s => classifier.addDocument(s, 'toxic'));
cleanSamples.forEach(s => classifier.addDocument(s, 'clean'));
classifier.train();

function getToxicityResult(text) {
  if (!text || text.length < 3) return { isToxic: false };
  const label = classifier.classify(text.toLowerCase());
  return { isToxic: label === 'toxic' };
}

module.exports = { getToxicityResult };
