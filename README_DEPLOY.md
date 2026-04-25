# MHAH deploy quickstart

Lis d'abord `DEPLOYMENT_ULTRA_SIMPLE.md`, puis `WEBHOOK_CHECKLIST.md`.

## Commandes locales
```bash
cp .env.example .env
npm install
node server.js
```

## Vérification rapide
- Ouvre `/api/health`
- Vérifie `stripeConfigured`, `paypalConfigured`, `moncashConfigured`
- Vérifie les URLs `returnUrls`
