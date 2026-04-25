# MHAH — Déploiement ultra simple

## 1) Variables `.env`
Copie `.env.example` vers `.env`, puis remplace toutes les valeurs `xxx`.

## 2) URLs de retour / callback à utiliser
- App publique : `${APP_BASE_URL}`
- Retour Stripe : `${APP_BASE_URL}/payment-return/stripe`
- Retour PayPal : `${APP_BASE_URL}/payment-return/paypal`
- Retour MonCash à configurer dans le portail marchand : `${APP_BASE_URL}/payment-return/moncash`
- Webhook Stripe : `${APP_BASE_URL}/api/webhooks/stripe`
- Webhook PayPal : `${APP_BASE_URL}/api/webhooks/paypal`

## 3) Windows local
```powershell
cd C:\chemin\vers\mhah-fullstack-package
copy .env.example .env
npm install
node server.js
```
Puis ouvre `${APP_BASE_URL}` dans le navigateur.

## 4) VPS Ubuntu ultra simple
```bash
sudo apt update
sudo apt install -y nodejs npm
mkdir -p /var/www/mhah && cd /var/www/mhah
# copie les fichiers ici
cp .env.example .env
npm install
node server.js
```
Pour un service persistant, utilise PM2 ou systemd.

### PM2 rapide
```bash
sudo npm install -g pm2
pm2 start server.js --name mhah
pm2 save
pm2 startup
```

## 5) Render
1. Crée un nouveau **Web Service**
2. Connecte le repo ou uploade le code
3. Build command : `npm install`
4. Start command : `node server.js`
5. Ajoute les variables de `.env.example` dans Render
6. Mets `APP_BASE_URL` sur l’URL publique Render
7. Déclare les webhooks Stripe/PayPal avec cette même URL publique

## 6) Railway
1. Nouveau projet
2. Déploie le dossier
3. Start command : `node server.js`
4. Ajoute toutes les variables d’environnement
5. Mets `APP_BASE_URL` sur l’URL publique Railway
6. Configure les webhooks Stripe/PayPal et le retour MonCash

## 7) PayPal final
- `PAYPAL_ENV=sandbox` pour test
- `PAYPAL_ENV=live` pour prod
- Mets les vraies valeurs pour `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
- Le flux utilisé est `Orders v2` côté serveur avec capture au retour et support webhook [PayPal Developer](https://developer.paypal.com/docs/api/orders/v2/)

## 8) MonCash final
Dans le portail marchand MonCash, cale l’URL de retour vers :
`https://ton-domaine.com/payment-return/moncash`

Le backend crée le paiement via l’API MonCash et vérifie ensuite le retour avec `orderId` ou `transactionId` [MonCash](https://sandbox.moncashbutton.digicelgroup.com/Moncash-business/resources/doc/RestAPI_MonCash_doc.pdf)

## 9) Stripe final
Le backend crée une session Checkout hébergée, puis confirme via retour et webhook `checkout.session.completed` [Stripe](https://docs.stripe.com/api/checkout/sessions) [Stripe](https://docs.stripe.com/webhooks)
