# IperChain - Documento Tecnico

## Architettura della Blockchain IperChain

IperChain è una blockchain privata specializzata nella tracciabilità delle supply chain, implementata in JavaScript utilizzando Node.js. La blockchain è progettata per garantire l'autenticità e la provenienza dei prodotti dal produttore al consumatore finale, con la filiera vitivinicola come primo caso d'uso implementato.

### Componenti Principali

1. **IperChain Node** (`bin/iperchain-node.js`): Il core della blockchain che implementa:
   - Gestione dei blocchi e transazioni
   - Consenso Proof of Authority (PoA)
   - Interfaccia JSON-RPC
   - Layer P2P per la comunicazione tra nodi

2. **P2P Network** (`network/p2p-node.js`): Implementa la comunicazione tra nodi utilizzando:
   - Libp2p per la gestione P2P
   - GossipSub per la propagazione di messaggi
   - Discovery dei peer tramite MulticastDNS

3. **Contract Creator** (`contract-creator/`): Sistema per la creazione di contratti intelligenti specifici per diverse filiere produttive:
   - Definizione degli attori e ruoli
   - Strutturazione dei dati specifici per prodotto
   - Generazione di interfacce CLI personalizzate

4. **Interfacce CLI per attori**:
   - Produttore: registrazione dei lotti di produzione
   - Certificatore: certificazione qualità e conformità
   - Distributore: gestione logistica e trasporti
   - Rivenditore: gestione inventario e vendite

## Meccanismo di Consenso: Proof of Authority (PoA)

### Implementazione del PoA

La blockchain IperChain utilizza un meccanismo di consenso Proof of Authority in cui:

1. **Autorizzazioni Predefinite**: Solo indirizzi specifici (authorities) sono autorizzati a validare blocchi:
   ```javascript
   const AUTHORITIES = [
     '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Produttore
     '0x123f681646d4a755815f9cb19e1acc8565a0c2ac', // Certificatore
     '0x456f681646d4a755815f9cb19e1acc8565a0c2ac', // Distributore/Rivenditore
     '0x999f681646d4a755815f9cb19e1acc8565a0c2ac'  // Contract Creator
   ];
   ```

2. **Selezione Round-Robin**: Gli authority nodes si alternano nella produzione di blocchi secondo un meccanismo round-robin:
   ```javascript
   const currentAuthority = AUTHORITIES[currentAuthorityIndex];
   currentAuthorityIndex = (currentAuthorityIndex + 1) % AUTHORITIES.length;
   ```

3. **Validazione dei Blocchi**: Durante la validazione, si verifica che il blocco sia stato creato da un'autorità legittima:
   ```javascript
   if (!AUTHORITIES.includes(block.miner)) return false;
   ```

### Vantaggi del PoA per Supply Chain

1. **Efficienza energetica**: Nessun mining computazionalmente costoso, ideale per implementazioni aziendali
2. **Alta velocità di transazione**: Blocchi prodotti ogni 10 secondi, per operazioni rapide nella filiera
3. **Finalità prevedibile**: Identità degli authority nodes note e fidate, adatto quando gli attori sono noti
4. **Adatto per blockchain permissioned**: Perfetto per ecosistemi di supply chain con attori predefiniti

## Struttura dei Dati

### Blocchi

```javascript
{
  number: '0x' + blockNumber.toString(16),
  hash: '0x' + crypto.createHash('sha256').update(`block-${blockNumber}-${timestamp}`).digest('hex'),
  parentHash: parentHash,
  timestamp: '0x' + timestamp.toString(16),
  transactions: transactions,
  miner: currentAuthority,
  difficulty: '0x1',
  totalDifficulty: '0x' + (blockNumber + 1).toString(16),
  size: '0x' + (1000 + transactions.length * 500).toString(16),
  gasUsed: '0x' + (transactions.length * 21000).toString(16),
  gasLimit: '0x1000000'
}
```

### Transazioni

```javascript
{
  hash: hash,
  from: params.from,
  to: params.to,
  value: params.value || '0x0',
  gas: params.gas || '0x5208',
  gasPrice: params.gasPrice || '0x3b9aca00',
  input: params.data || '0x',
  nonce: '0x' + state.accounts[params.from].nonce.toString(16)
}
```

### Contratti Intelligenti per Supply Chain

Il sistema supporta la creazione di contratti intelligenti per vari tipi di supply chain:

1. **Definizione della Filiera**: Specificazione degli attori e dei loro ruoli:
   ```javascript
   {
     actors: [
       { name: 'producer', displayName: 'Produttore', permissions: [...] },
       { name: 'certifier', displayName: 'Certificatore', permissions: [...] },
       { name: 'distributor', displayName: 'Distributore', permissions: [...] },
       { name: 'retailer', displayName: 'Rivenditore', permissions: [...] }
     ]
   }
   ```

2. **Definizione del Prodotto**: Schema dati specifico per il tipo di prodotto:
   ```javascript
   {
     properties: [
       { name: 'id', type: 'string', required: true },
       { name: 'productionDate', type: 'date', required: true },
       { name: 'batchSize', type: 'number', required: true },
       // Proprietà specifiche per la filiera
       { name: 'variety', type: 'string', required: false } // Es. per vini
     ]
   }
   ```

## Sicurezza del Sistema

### Meccanismi di Sicurezza

1. **Autenticazione delle Autorità**:
   - Solo indirizzi predefiniti possono produrre blocchi
   - Controllo stretto sugli attori autorizzati

2. **Integrità dei Dati**:
   - Firma crittografica delle transazioni
   - Hash crittografici per la verifica dell'integrità dei blocchi
   - Validazione di transazioni e blocchi prima dell'inclusione

3. **Immutabilità**:
   - Catena di blocchi collegati tramite hash
   - Consenso distribuito per impedire modifiche unilaterali

4. **Separazione dei Ruoli**:
   - Ogni attore (produttore, certificatore, distributore, rivenditore) ha autorizzazioni specifiche
   - Controllo degli accessi basato su ruoli per garantire che ogni partecipante possa eseguire solo le operazioni appropriate

## Efficienza e Prestazioni

### Ottimizzazioni

1. **Consenso Leggero**:
   - Il PoA evita i calcoli intensivi del Proof of Work
   - Mining più veloce e a basso consumo energetico, adatto per supply chain aziendali

2. **Architettura P2P Ottimizzata**:
   - Utilizzo di libp2p per comunicazioni P2P efficienti
   - GossipSub per propagazione efficiente dei messaggi

3. **Latenze Ridotte**:
   - Blocchi generati ogni 10 secondi
   - Conferme transazioni in tempi brevi per facilitare operazioni in tempo reale nella supply chain

4. **Scalabilità**:
   - Design modulare che permette estensione della rete
   - Possibilità di aggiungere nodi authority in base alle esigenze della filiera

## Comunicazione tra Attori e Messaggistica

La blockchain utilizza un sistema di messaggistica pub/sub basato su topic, facilmente adattabile a diverse filiere:

```javascript
topics: {
  // Per filiera vitivinicola (esempio implementato)
  WINE_BATCHES: 'iperchain/wine/batches/1.0.0',
  CERTIFICATIONS: 'iperchain/wine/certifications/1.0.0',
  TRANSFERS: 'iperchain/wine/transfers/1.0.0',
  
  // Per filiera generica
  PRODUCT_BATCHES: 'iperchain/product/batches/1.0.0',
  PRODUCT_CERTIFICATIONS: 'iperchain/product/certifications/1.0.0',
  PRODUCT_TRANSFERS: 'iperchain/product/transfers/1.0.0',
  
  // Canali di sistema
  BLOCKS: 'iperchain/blocks/1.0.0',
  CONSENSUS: 'iperchain/consensus/1.0.0'
}
```

Gli attori si iscrivono ai topic di loro interesse e ricevono automaticamente aggiornamenti.

## API e Interazione

IperChain offre un'interfaccia JSON-RPC compatibile con standard Ethereum, che include:

- `eth_blockNumber`: Ottiene l'ultimo numero di blocco
- `eth_getBlockByNumber`: Ottiene un blocco specifico
- `eth_getBlockByHash`: Ottiene un blocco tramite hash
- `eth_getTransactionByHash`: Ottiene dettagli di una transazione
- `eth_sendTransaction`: Invia una nuova transazione
- `eth_call`: Esegue una chiamata a un metodo di contratto

## Creazione di Nuove Supply Chain

Per creare una nuova implementazione per una specifica supply chain:

1. **Definire lo Schema della Filiera**:
   ```javascript
   const supplyChainSchema = {
     name: 'pharmaceutical',
     actors: ['manufacturer', 'regulator', 'distributor', 'pharmacy'],
     productSchema: {
       // Schema specifico del prodotto farmaceutico
     }
   };
   ```

2. **Generare le Interfacce CLI**:
   ```javascript
   const ContractCreator = require('./contract-creator');
   ContractCreator.generateSupplyChainCLIs(supplyChainSchema);
   ```

3. **Personalizzare la Logica di Business**:
   - Implementare regole specifiche della filiera
   - Definire flussi di validazione specifici per prodotto

## Conclusioni Tecniche

IperChain rappresenta un'implementazione efficiente di blockchain privata per supply chain che bilancia:

1. **Sicurezza**: Attraverso un meccanismo di consenso PoA ben definito
2. **Efficienza**: Con un mining a basso consumo energetico
3. **Affidabilità**: Mediante una rete P2P robusta
4. **Usabilità**: Con interfacce CLI dedicate per ogni attore
5. **Flessibilità**: Con la possibilità di creare contratti per diverse filiere produttive

Questa architettura è particolarmente adatta per ecosistemi di supply chain dove la fiducia tra gli attori è fondamentale, ma richiede comunque trasparenza e verifica delle operazioni. Il sistema implementato per la filiera vitivinicola rappresenta un caso d'uso dimostrativo delle potenzialità del sistema per qualsiasi tipo di supply chain. 