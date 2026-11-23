# CAP SUP : version avec comptes et paiements

Ce dossier contient le site complet : un petit serveur (Node.js) qui gère les comptes, la sauvegarde de la progression et les abonnements Stripe, plus le site lui-même (`public/`).

> Ce code n'a pas été testé avec un vrai compte Stripe. Teste-le d'abord en mode TEST, avec des cartes de test, avant de passer en réel.

## Ce que fait le serveur
- Inscription et connexion (mot de passe haché, cookie de session sécurisé).
- Sauvegarde automatique de la progression, des fiches lues, du planning, etc.
- Paiement des abonnements via Stripe Checkout (9,99 €/mois et 79,99 €/an).
- Activation et coupure automatiques de Premium via le webhook Stripe.
- Gestion de l'abonnement (changer de carte, résilier) via le portail client Stripe.
- Suppression du compte depuis le profil.

## 1. Préparer Stripe (mode test)
1. Crée un compte sur stripe.com et reste en **mode test** (interrupteur en haut du tableau de bord).
2. Catalogue de produits : crée un produit « CAP SUP Premium » avec deux prix récurrents : **9,99 € / mois** et **79,99 € / an**. Note les deux identifiants `price_...`.
3. Paramètres > Billing > **Portail client** : active-le (changement de moyen de paiement, annulation d'abonnement).
4. Paramètres > Public details : renseigne le nom de ton activité et l'adresse de support.
5. Plus tard, pour être payé : onglet Paramètres > Compte, vérification d'identité et ajout de ton IBAN. Les versements sont ensuite automatiques vers ton compte bancaire.

## 2. Installer et lancer en local
```
npm install
cp .env.example .env     # puis remplis .env
npm start
```
Variables dans `.env` : `JWT_SECRET` (chaîne aléatoire, voir l'exemple dans le fichier), `STRIPE_SECRET_KEY` (clé `sk_test_...`), `PRICE_MONTHLY` et `PRICE_ANNUAL` (les identifiants de prix), `STRIPE_WEBHOOK_SECRET` (voir l'étape suivante), `BASE_URL`.

Pour recevoir les webhooks en local, installe la CLI Stripe puis lance :
```
stripe listen --forward-to localhost:3000/api/webhook
```
Elle affiche une clé `whsec_...` à mettre dans `STRIPE_WEBHOOK_SECRET`. Ouvre ensuite http://localhost:3000, crée un compte, clique sur Premium et paie avec la carte de test `4242 4242 4242 4242` (date future, CVC quelconque). Ton compte doit passer en Premium en quelques secondes.

## 3. Mettre en ligne
- Hébergeur simple : Render, Railway, Fly.io ou un petit serveur (VPS). Commande de démarrage : `npm start`.
- La base SQLite est un fichier (`capsup.db`). Il doit être sur un **disque persistant** (volume monté), sinon tes comptes disparaissent à chaque redémarrage. Indique son chemin dans `DB_PATH`. Fais des sauvegardes régulières.
- Utilise un nom de domaine en **HTTPS** et mets-le dans `BASE_URL`.
- Dans Stripe > Développeurs > Webhooks : ajoute le point de terminaison `https://TON-DOMAINE/api/webhook` avec les événements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copie la clé de signature dans `STRIPE_WEBHOOK_SECRET`.
- Pour passer en réel : refais les étapes Stripe en mode **réel** (produit, prix, portail, webhook), remplace les clés et les `price_...`.

## 4. Avant d'ouvrir au public
- Remplis les pages `cgv.html`, `mentions.html` et `confidentialite.html` (modèles à compléter) et fais-les relire.
- Remplace `contact@exemple.fr` dans `public/app-api.js` par ton adresse de support.
- Vérifie ton statut (micro-entreprise ou autre) et la TVA avec l'URSSAF, les impôts ou un expert-comptable.
- Fais relire les fiches : elles ont été écrites de mémoire et peuvent contenir des erreurs.

## Limites connues
- La limite de 3 QCM gratuits par jour est appliquée dans le navigateur : un utilisateur averti peut la contourner. Le statut Premium, lui, est contrôlé par le serveur.
- Pas de réinitialisation du mot de passe, ni d'e-mail de confirmation : à ajouter avec un service d'envoi d'e-mails.
- Les témoignages fictifs de la page d'accueil ont été retirés (des faux avis sont interdits pour un site qui vend un service).

## Assistant IA (optionnel)
Renseigne `ANTHROPIC_API_KEY` dans `.env` : la route `/api/tutor` répond alors aux abonnés Premium en s'appuyant sur les fiches (40 questions/heure/utilisateur). Sans clé, l'assistant répond quand même à partir des fiches, sans IA.

## Où va l'argent
Stripe encaisse les paiements sur TON compte Stripe, puis les verse sur l'IBAN que tu y renseignes (Tableau de bord Stripe → Paramètres → Versements). Rien ne part tout seul : il faut créer le compte, vérifier ton identité, renseigner l'IBAN, créer les 2 prix, configurer le webhook et déployer ce serveur.
