#!/bin/bash

# Script de test complet pour la configuration domaine Render
# À exécuter après avoir configuré le domaine et attendu la propagation DNS

echo "🧪 Test de configuration domaine mouvementshaitiauxhaitiens.net"
echo "============================================================"

DOMAIN="mouvementshaitiauxhaitiens.net"
RENDER_URL="https://mhah-fullstack.onrender.com"

echo ""
echo "1. Test de propagation DNS..."
echo "------------------------------"

# Test CNAME pour le domaine principal
echo "Vérification CNAME pour $DOMAIN:"
dig CNAME $DOMAIN +short

# Test CNAME pour www
echo ""
echo "Vérification CNAME pour www.$DOMAIN:"
dig CNAME www.$DOMAIN +short

echo ""
echo "2. Test d'accès HTTP..."
echo "------------------------"

# Test accès au domaine
echo "Test accès $DOMAIN:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nTime: %{time_total}s\n" https://$DOMAIN/

# Test accès www
echo ""
echo "Test accès www.$DOMAIN:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nTime: %{time_total}s\n" https://www.$DOMAIN/

echo ""
echo "3. Test API health..."
echo "----------------------"

# Test API health sur le domaine officiel
echo "Test API health sur $DOMAIN:"
curl -s https://$DOMAIN/api/health | head -20

# Test API health sur Render direct
echo ""
echo "Test API health sur Render direct:"
curl -s $RENDER_URL/api/health | head -20

echo ""
echo "4. Test CORS..."
echo "----------------"

# Test CORS depuis le domaine officiel
echo "Test CORS depuis $DOMAIN:"
curl -s -H "Origin: https://$DOMAIN" -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://$DOMAIN/api/health -I | grep -i "access-control"

echo ""
echo "5. Test chargement mhah-api-patch.js..."
echo "----------------------------------------"

# Test chargement du script API
echo "Test mhah-api-patch.js sur $DOMAIN:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://$DOMAIN/mhah-api-patch.js

echo ""
echo "6. Test Supabase connectivity..."
echo "---------------------------------"

# Test connexion à Supabase via l'API
echo "Test connexion Supabase via API:"
curl -s -X GET https://$DOMAIN/api/health | grep -o '"supabaseConfigured":[^,]*'

echo ""
echo "7. Instructions de test manuel..."
echo "----------------------------------"

echo "📋 Tests manuels à effectuer :"
echo ""
echo "1. Ouvrir https://$DOMAIN dans un navigateur"
echo "2. Vérifier que le site se charge sans erreur 404"
echo "3. Se connecter en tant qu'admin"
echo "4. Ajouter un nouveau membre"
echo "5. Vérifier dans Supabase que le membre apparaît"
echo "6. Effectuer un paiement test Stripe"
echo "7. Vérifier que le paiement est enregistré"
echo ""
echo "8. Vérifier les logs Render pour confirmer les appels API"
echo ""
echo "✅ Si tous les tests passent, la configuration est réussie !"

echo ""
echo "============================================================"
echo "Fin des tests automatiques"