# Configuration Domaine - mouvementshaitiauxhaitiens.net vers Render

## 🎯 Objectif
Configurer `mouvementshaitiauxhaitiens.net` pour pointer vers Render afin d'assurer la synchronisation complète avec Supabase.

## 📋 Étapes de Configuration

### 1. Configuration dans Render
1. Aller dans votre dashboard Render : https://dashboard.render.com
2. Sélectionner votre service `mhah-fullstack`
3. Aller dans l'onglet "Settings" > "Custom Domains"
4. Ajouter les domaines suivants :
   - `mouvementshaitiauxhaitiens.net`
   - `www.mouvementshaitiauxhaitiens.net`
5. Render vous donnera des valeurs CNAME à utiliser

### 2. Configuration DNS chez Namecheap
Dans votre panneau Namecheap, aller dans "Domain List" > "Manage" pour `mouvementshaitiauxhaitiens.net` :

#### Enregistrements CNAME requis :
```
Type: CNAME
Host: www
Value: [valeur fournie par Render pour www.mouvementshaitiauxhaitiens.net]
TTL: 300

Type: CNAME
Host: @
Value: [valeur fournie par Render pour mouvementshaitiauxhaitiens.net]
TTL: 300
```

#### Vérification des enregistrements A existants :
S'assurer qu'il n'y a pas d'enregistrements A conflictuels pointant vers cPanel.

### 3. Variables d'environnement dans Render
Vérifier que ces variables sont configurées dans Render :

```
APP_BASE_URL=https://mouvementshaitiauxhaitiens.net
SUPABASE_URL=[votre URL Supabase]
SUPABASE_ANON_KEY=[votre clé anonyme]
SUPABASE_SERVICE_ROLE_KEY=[votre clé service role]
JWT_SECRET=[clé JWT sécurisée]
STRIPE_SECRET_KEY=[clé Stripe]
STRIPE_WEBHOOK_SECRET=[secret webhook Stripe]
PAYPAL_CLIENT_ID=[ID PayPal]
PAYPAL_CLIENT_SECRET=[secret PayPal]
PAYPAL_WEBHOOK_ID=[ID webhook PayPal]
MONCASH_CLIENT_ID=[ID MonCash]
MONCASH_CLIENT_SECRET=[secret MonCash]
```

### 4. Configuration des Webhooks
Mettre à jour les URLs de webhook pour pointer vers le domaine officiel :

#### Stripe :
- URL : `https://mouvementshaitiauxhaitiens.net/api/webhooks/stripe`

#### PayPal :
- URL : `https://mouvementshaitiauxhaitiens.net/api/webhooks/paypal`

#### MonCash :
- URL de retour : `https://mouvementshaitiauxhaitiens.net/payment-return/moncash`

### 5. Vérifications Post-Configuration

#### A. Vérifier la propagation DNS :
```bash
# Vérifier les enregistrements CNAME
dig CNAME www.mouvementshaitiauxhaitiens.net
dig CNAME mouvementshaitiauxhaitiens.net

# Vérifier que cela pointe vers Render
curl -I https://mouvementshaitiauxhaitiens.net
```

#### B. Tester l'accès au site :
- Ouvrir `https://mouvementshaitiauxhaitiens.net` dans un navigateur
- Vérifier que le site se charge correctement
- Vérifier que `mhah-api-patch.js` se charge sans erreur 404

#### C. Tester la synchronisation :
1. Se connecter en tant qu'admin
2. Ajouter un nouveau membre
3. Vérifier dans Supabase que les données apparaissent
4. Vérifier les logs Render pour confirmer les appels API

#### D. Tester les paiements :
1. Effectuer un paiement test avec Stripe
2. Vérifier que les webhooks arrivent sur Render
3. Vérifier que les données de paiement sont enregistrées

### 6. Dépannage

#### Si le domaine ne se charge pas :
- Attendre 24-48h pour la propagation DNS
- Vérifier les enregistrements CNAME dans Namecheap
- Vérifier que le domaine est bien ajouté dans Render

#### Si les API ne fonctionnent pas :
- Vérifier les logs Render pour les erreurs CORS
- S'assurer que `APP_BASE_URL` est correct
- Tester directement `https://mhah-fullstack.onrender.com/api/health`

#### Si la synchronisation échoue :
- Vérifier que Supabase accepte les connexions depuis Render
- Contrôler les variables d'environnement Supabase
- Examiner les logs serveur pour les erreurs de base de données

### 7. Migration Finale

Une fois tout configuré et testé :
1. Supprimer le frontend de cPanel Namecheap
2. Garder seulement la configuration DNS pointant vers Render
3. Le domaine officiel servira maintenant directement depuis Render

## ✅ Checklist de Validation

- [ ] Domaine ajouté dans Render
- [ ] DNS CNAME configurés chez Namecheap
- [ ] Propagation DNS vérifiée (24-48h)
- [ ] Site accessible sur `https://mouvementshaitiauxhaitiens.net`
- [ ] API `/api/health` répond correctement
- [ ] Synchronisation avec Supabase fonctionne
- [ ] Paiements Stripe fonctionnent
- [ ] Webhooks configurés avec le bon domaine
- [ ] SSL/HTTPS automatique via Render
- [ ] Frontend supprimé de cPanel

## 🔒 Sécurité

- Render fournit automatiquement le SSL pour les domaines personnalisés
- Les webhooks utilisent des secrets sécurisés
- CORS configuré pour accepter seulement les origines autorisées
- Variables d'environnement chiffrées dans Render