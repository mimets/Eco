const natural = require('natural');

/**
 * NeuralModerator - A statistical ML classifier for Italian toxicity.
 * Trained on semantic patterns, personal attacks, and aggressive behavior.
 */

const classifier = new natural.BayesClassifier();

// --- TRAINING DATA ---
// TOXIC SAMPLES (Semantic, insults, aggression)
const toxicSamples = [
  "sei un fallito", "fai schifo", "non vali niente", "devi sparire", "ammazzati", 
  "sei inutile", "ritardato di merda", "sei una palla di lardo", "nessuno ti vuole", 
  "sparisci dalla faccia della terra", "sei un poveraccio", "fatti schifo da solo",
  "crepa male", "sei uno sfigato", "non capisci un cazzo", "sei un ignorante ridicolo",
  "ti odio", "voglio che muori", "sei la feccia dell'umanità", "gente come te non serve"
];

// CLEAN SAMPLES (Normal, conversational, positive)
const cleanSamples = [
  "ciao a tutti!", "bella giornata oggi", "ho fatto 10km in bici", "che bel panorama", 
  "grazie per il consiglio", "ottimo lavoro team", "mi piace questa sfida", 
  "andiamo avanti così", "salviamo il pianeta", "oggi ho mangiato bene",
  "non sono d'accordo ma rispetto la tua opinione", "come si fa a partecipare?",
  "buonasera", "grazie mille", "molto interessante", "un pezzo di pane",
  "che bel treno", "mi piace correre", "la natura è bellissima", "buona fortuna"
];

// Train the classifier
toxicSamples.forEach(s => classifier.addDocument(s, 'toxic'));
cleanSamples.forEach(s => classifier.addDocument(s, 'clean'));

classifier.train();

/**
 * Classifies text and returns a toxicity score/decision.
 */
function getToxicityResult(text) {
  if (!text || text.length < 3) return { isToxic: false, score: 0 };
  
  const label = classifier.classify(text.toLowerCase());
  const classifications = classifier.getClassifications(text.toLowerCase());
  
  // Calculate a simplified "toxicity score"
  const toxicClass = classifications.find(c => c.label === 'toxic');
  const score = toxicClass ? toxicClass.value : 0;
  
  // For Naive Bayes in 'natural', labels are definitive but values are relative.
  // We'll trust the label 'toxic' if it's the winner.
  return {
    isToxic: label === 'toxic',
    score: score
  };
}

module.exports = { getToxicityResult };
