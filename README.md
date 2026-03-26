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

## Configurazione Email (SMTP)

Per inviare email di verifica e recupero password, hai due opzioni:

### 1. Senza Dominio (Gmail - Demo/MVP)
Puoi usare un account Gmail personale:
1. Vai su [Google Account Security](https://myaccount.google.com/security).
2. Attiva la **Verifica in due passaggi**.
3. Cerca "Password per le app" e creane una per EcoTrack.
4. Usa queste variabili in Render/.env:
   ```env
   MAIL_USER=tua_email@gmail.com
   MAIL_PASS=password_app_generata
   ```

### 2. Con Dominio (Produzione)
Usa un servizio come **Resend**, **SendGrid** o **Brevo**. Richiede l'aggiunta di record DNS (TXT/CNAME) al tuo dominio per verificare la proprietà e prevenire lo spam.

---

## Documentazione
- [Documentazione API](README_API.md)
- [Project Backlog](backlog.md)
- [Product One-Pager](one-pager.md)
