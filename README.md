# EcoTrack 🌱

EcoTrack è una soluzione mobile (PWA) per il monitoraggio dell'impronta di carbonio individuale e di team.

## Funzionalità Core
- **Stima CO₂**: Calcoli trasparenti basati su attività di trasporto e lavoro.
- **Gamification**: Sistema di punti, badge e shop avatar.
- **Social**: Chat di gruppo, feed community e sfide.
- **EcoAI**: Suggerimenti personalizzati tramite assistente AI.

## Prerequisiti
- [Node.js](https://nodejs.org/) (versione 14 o superiore)
- [PostgreSQL](https://www.postgresql.org/)

## Installazione Locale

1. Clona la repository:
   ```bash
   git clone [URL_REPOS]
   cd ecotrack
   ```

2. Installa le dipendenze:
   ```bash
   npm install
   ```

3. Configura le variabili d'ambiente (.env):
   ```env
   DATABASE_URL=postgres://user:pass@localhost:5432/ecotrack
   JWT_SECRET=il_tuo_segreto
   PORT=3000
   ADMIN_PASSWORD=la_tua_password_admin
   ```

4. Avvia il server:
   ```bash
   npm start
   ```
   L'app sarà disponibile su `http://localhost:3000`.

## Documentazione
- [Documentazione API](README_API.md)
- [Project Backlog](backlog.md)
- [Product One-Pager](one-pager.md)
