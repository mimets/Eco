const { isProfane, sanitize } = require('./moderator');

const testCases = [
  "Ciao come stai?", // False
  "Cazzo!", // True
  "P.u.t.t.a.n.a", // True (after normalization)
  "M3rd4!", // True
  "D1o C4n3", // True (Blasphemy)
  "Porco Dio", // True (Blasphemy)
  "M4d0nn4 m414l3", // True (Blasphemy)
  "Gesù b.o.i.a", // True (Blasphemy)
  "Sei un bastardo", // True
  "Questo è un test", // False
  "Perché quindi", // False (Common words)
];

testCases.forEach(tc => {
  const result = isProfane(tc);
  console.log(`[${result ? 'BANNED' : 'CLEAN '}] "${tc}"`);
});

console.log("\nSanitized Test:");
console.log(sanitize("Che cazzo dici? Merda!"));
