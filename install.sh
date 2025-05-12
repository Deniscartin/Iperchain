#!/bin/bash

# Script di installazione per il Sistema di Tracciabilità del Vino IperChain

echo "==============================================="
echo "Installazione Sistema di Tracciabilità IperChain"
echo "==============================================="

# Verifica che Node.js sia installato
if ! command -v node &> /dev/null; then
    echo "Node.js non è installato. Per favore installalo prima di continuare."
    exit 1
fi

# Verifica la versione di Node.js
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d '.' -f 1)

if [ $NODE_MAJOR -lt 14 ]; then
    echo "Versione di Node.js troppo vecchia. Richiesta v14.0.0 o superiore."
    echo "Versione attuale: v$NODE_VERSION"
    exit 1
fi

echo "Node.js v$NODE_VERSION trovato. Proseguo con l'installazione..."

# Installa le dipendenze
echo "Installazione delle dipendenze..."
npm install

# Crea le cartelle necessarie se non esistono
echo "Creazione struttura delle cartelle..."
mkdir -p shared-data/producer/certifications
mkdir -p shared-data/certifier/incoming
mkdir -p shared-data/retailer/incoming
mkdir -p shared-data/contracts

# Assicura che le cartelle degli attori esistano
mkdir -p producer
mkdir -p certifier
mkdir -p retailer
mkdir -p contract-creator

# Rendi eseguibili gli script
echo "Rendendo eseguibili gli script..."
chmod +x producer/*.js certifier/*.js retailer/*.js contract-creator/*.js bin/*.js *.sh

# Verifica se i file di database esistono già
if [ ! -f producer/producer-batches.json ]; then
    echo "{}" > producer/producer-batches.json
    echo "Creato database del produttore."
fi

if [ ! -f certifier/certifier-batches.json ]; then
    echo "{}" > certifier/certifier-batches.json
    echo "Creato database del certificatore."
fi

if [ ! -f retailer/retailer-batches.json ]; then
    echo "{}" > retailer/retailer-batches.json
    echo "Creato database del rivenditore."
fi

if [ ! -f contract-creator/contracts-db.json ]; then
    echo '{"contracts":{}}' > contract-creator/contracts-db.json
    echo "Creato database dei contratti."
fi

if [ ! -f producer/known-certifiers.json ]; then
    echo '[{"id":"certifier1","name":"Premium Wine Certifications","address":"0x123f681646d4a755815f9cb19e1acc8565a0c2ac"}]' > producer/known-certifiers.json
    echo "Creata lista dei certificatori noti."
fi

if [ ! -f certifier/known-retailers.json ]; then
    echo '[{"id":"retailer1","name":"Premium Wine Shop","address":"0x456f681646d4a755815f9cb19e1acc8565a0c2ac"}]' > certifier/known-retailers.json
    echo "Creata lista dei rivenditori noti."
fi

echo ""
echo "==============================================="
echo "Installazione completata con successo!"
echo "==============================================="
echo ""
echo "Per avviare il sistema, esegui:"
echo "./start-wine-cli-demo.sh"
echo ""
echo "Buon divertimento con il Sistema di Tracciabilità del Vino IperChain!" 