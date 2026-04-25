# Webhook checklist MHAH

## Stripe
- URL : `${APP_BASE_URL}/api/webhooks/stripe`
- Secret à copier dans `STRIPE_WEBHOOK_SECRET`
- Événement minimum : `checkout.session.completed`
- Vérifier que l’URL publique répond en HTTPS [Stripe](https://docs.stripe.com/webhooks)

## PayPal
- URL : `${APP_BASE_URL}/api/webhooks/paypal`
- Récupérer l’ID du webhook et le mettre dans `PAYPAL_WEBHOOK_ID`
- Vérifier que `PAYPAL_ENV` correspond bien à sandbox ou live
- Confirmer que les credentials PayPal sont ceux du même environnement [PayPal Developer](https://developer.paypal.com/docs/api/orders/v2/)

## MonCash
- Pas de webhook serveur utilisé ici
- Configurer l’URL de retour du portail marchand : `${APP_BASE_URL}/payment-return/moncash`
- Tester un paiement sandbox puis vérifier le retour `orderId` / `transactionId` [MonCash](https://sandbox.moncashbutton.digicelgroup.com/Moncash-business/resources/doc/RestAPI_MonCash_doc.pdf)

## Vérification finale
- `GET ${APP_BASE_URL}/api/health`
- Login membre/admin OK
- Paiement Stripe crée une session
- Paiement PayPal crée une order
- Paiement MonCash génère une URL de redirection
- Les retours mettent à jour l’historique paiement dans l’app
