# IperChain Supply Chain Management System

Un sistema basato su blockchain per la tracciabilità delle supply chain, che assicura l'autenticità e la provenienza dei prodotti dal produttore al consumatore finale.

## Panoramica

Il sistema IperChain Supply Chain Management permette di:
- Registrare nuovi prodotti o lotti sulla blockchain
- Aggiungere certificazioni ai prodotti
- Tracciare il trasporto dei lotti
- Verificare l'arrivo presso i distributori e rivenditori
- Generare codici QR per la verifica dei prodotti da parte dei consumatori
- Creare contratti intelligenti personalizzati per diversi tipi di supply chain

## Casi d'Uso

IperChain può essere implementato in diverse filiere produttive:

1. **Industria Vitivinicola**: Tracciabilità delle partite di vino dal vigneto alla bottiglia
2. **Agroalimentare**: Verifica della provenienza e qualità di prodotti alimentari
3. **Farmaceutica**: Monitoraggio della distribuzione di medicinali
4. **Luxury Goods**: Autenticazione di prodotti di lusso contro la contraffazione
5. **Componenti Industriali**: Tracciabilità di parti e componenti nella manifattura

## Architettura

Il sistema è composto da:

1. **IperChain Node**: Un nodo blockchain locale basato su Proof of Authority che gestisce transazioni e blocchi
2. **Smart Contract Creator**: Per la creazione di contratti intelligenti specifici per ogni filiera
3. **Interfacce a riga di comando (CLI)** specifiche per ogni attore:
   - **Produttore**: Per registrare nuovi lotti di prodotto sulla blockchain
   - **Certificatore**: Per certificare i prodotti con marchi di qualità
   - **Distributore**: Per gestire il trasporto e la logistica
   - **Rivenditore**: Per tracciare le vendite e verificare i prodotti

## Installazione

### Prerequisiti

- Node.js (v14 o superiore)
- npm (v6 o superiore)

### Configurazione

1. Clona il repository:
   ```
   git clone [url-repository]
   cd iperchain
   ```

2. Installa le dipendenze:
   ```
   npm install
   ```

3. Esegui lo script di installazione:
   ```
   ./install.sh
   ```

## Implementazione di Esempio: Wine Supply Chain

Come esempio di implementazione, il sistema include una versione completa per la filiera vitivinicola:

### Avvio del Wine Supply Demo

Esegui lo script di avvio per ricevere istruzioni:

```
./start-wine-cli-demo.sh
```

Questo script avvia automaticamente terminali separati per ogni attore:

- **Produttore di vino**: `./wine-producer-cli.js`
- **Certificatore**: `./wine-certifier-cli.js`
- **Rivenditore**: `./wine-retailer-cli.js`

### Flusso di lavoro tipico (Wine Supply Chain)

1. **Produttore**:
   - Registrare una nuova partita di vino
   - Inviare la partita a un certificatore

2. **Certificatore**:
   - Controllare le richieste di certificazione in entrata
   - Certificare le partite con marchi di qualità
   - Inviare le partite certificate ai rivenditori

3. **Rivenditore**:
   - Controllare le partite in arrivo
   - Registrare l'arrivo delle partite
   - Vendere prodotti dalle partite verificate
   - Generare codici QR per i prodotti
   - Verificare l'autenticità su richiesta dei consumatori

## Creazione di Nuovi Contratti per Supply Chain

Il sistema supporta la creazione di contratti personalizzati per diverse filiere:

1. Utilizzare il Contract Creator:
   ```
   node contract-creator/create-supply-chain.js
   ```

2. Specificare gli attori della filiera e le loro interazioni

3. Generare le interfacce CLI specifiche per ogni attore

## Sviluppo

### File principali

- `bin/iperchain-node.js`: Il nodo blockchain IperChain
- `contract-creator/`: Strumenti per la creazione di contratti specifici per filiere
- `iperchain-wine.js`: Implementazione per la filiera del vino
- `start-wine-cli-demo.sh`: Script di avvio del demo vitivinicolo

### Aggiunta di nuove funzionalità

Per aggiungere nuove funzionalità al sistema:

1. Identificare l'attore appropriato nella supply chain
2. Aggiungere le funzioni necessarie al relativo file CLI
3. Aggiornare le interfacce utente per includere le nuove funzionalità

## Licenza

Questo progetto è rilasciato sotto licenza MIT.

---
Progetto ideato da Denis Cartin