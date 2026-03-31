/**
 * NeuralModerator - Zero-dependency Naive Bayes classifier for Italian toxicity.
 * No external packages needed — pure JS implementation.
 */

class NaiveBayes {
  constructor() {
    this.classes = {};
    this.vocab = new Set();
    this.totalDocs = 0;
  }

  tokenize(text) {
    return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  }

  addDocument(text, label) {
    if (!this.classes[label]) {
      this.classes[label] = { count: 0, wordCounts: {}, totalWords: 0 };
    }
    const tokens = this.tokenize(text);
    this.classes[label].count++;
    this.totalDocs++;
    for (const t of tokens) {
      this.vocab.add(t);
      this.classes[label].wordCounts[t] = (this.classes[label].wordCounts[t] || 0) + 1;
      this.classes[label].totalWords++;
    }
  }

  classify(text) {
    const tokens = this.tokenize(text);
    const vocabSize = this.vocab.size;
    let bestLabel = null, bestScore = -Infinity;

    for (const [label, data] of Object.entries(this.classes)) {
      let score = Math.log(data.count / this.totalDocs);
      for (const t of tokens) {
        const count = data.wordCounts[t] || 0;
        // Laplace smoothing
        score += Math.log((count + 1) / (data.totalWords + vocabSize));
      }
      if (score > bestScore) { bestScore = score; bestLabel = label; }
    }
    return bestLabel;
  }
}

const classifier = new NaiveBayes();

// --- TRAINING DATA ---
const toxicSamples = [
  "sei un fallito", "fai schifo", "non vali niente", "devi sparire", "ammazzati",
  "sei inutile", "sei una palla di lardo", "nessuno ti vuole",
  "sparisci dalla faccia della terra", "sei un poveraccio",
  "crepa male", "sei uno sfigato", "non capisci niente", "sei un ignorante ridicolo",
  "ti odio", "voglio che muori", "sei la feccia", "gente come te non serve",
  "sei stupido", "sei un cretino", "sei un idiota",
  "non sai fare niente", "sei inutile come sempre", "vai via di qua",
  "sei insopportabile", "non servi a niente", "brutto deficiente"
];

const cleanSamples = [
  "ciao a tutti", "bella giornata oggi", "ho fatto 10km in bici", "che bel panorama",
  "grazie per il consiglio", "ottimo lavoro team", "mi piace questa sfida",
  "andiamo avanti cosi", "salviamo il pianeta", "oggi ho mangiato bene",
  "non sono daccordo ma rispetto la tua opinione", "come si fa a partecipare",
  "buonasera", "grazie mille", "molto interessante",
  "che bel treno", "mi piace correre", "la natura e bellissima", "buona fortuna",
  "ottima idea", "sono daccordo", "possiamo farcela", "grande lavoro",
  "ho salvato co2 oggi", "bella esperienza nel parco"
];

toxicSamples.forEach(s => classifier.addDocument(s, 'toxic'));
cleanSamples.forEach(s => classifier.addDocument(s, 'clean'));

function getToxicityResult(text) {
  if (!text || text.length < 3) return { isToxic: false };
  const label = classifier.classify(text);
  return { isToxic: label === 'toxic' };
}

module.exports = { getToxicityResult };
