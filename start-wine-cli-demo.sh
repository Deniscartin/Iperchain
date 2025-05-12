#!/bin/bash

# Script di avvio per il demo del sistema di tracciabilità del vino con CLI

echo "==============================================="
echo "IperChain Wine Batch Traceability System - CLI"
echo "==============================================="

# Assicura che le cartelle condivise esistano
mkdir -p shared-data/producer/certifications
mkdir -p shared-data/certifier/incoming
mkdir -p shared-data/retailer/incoming

echo -e "\nIl sistema di tracciabilità del vino IperChain è composto da tre CLI separate:"
echo "1. Produttore: Per registrare nuove partite di vino e inviarle al certificatore"
echo "2. Certificatore: Per certificare le partite di vino e inviarle ai rivenditori"
echo "3. Rivenditore: Per ricevere le partite certificate, vendere bottiglie e verificare l'autenticità"
echo -e "\nCiascun attore funziona indipendentemente in un terminale separato."

echo -e "\nPer avviare il sistema, aprire 3 terminali e eseguire i seguenti comandi:"
echo -e "\nTerminale 1 (Produttore):"
echo -e "\t./producer/wine-producer-cli.js"
echo -e "\nTerminale 2 (Certificatore):"
echo -e "\t./certifier/wine-certifier-cli.js"
echo -e "\nTerminale 3 (Rivenditore):"
echo -e "\t./retailer/wine-retailer-cli.js"

echo -e "\nFlusso di lavoro di esempio:"
echo "1. Nel terminale del Produttore: Registrare una nuova partita di vino"
echo "2. Nel terminale del Produttore: Inviare la partita al Certificatore"
echo "3. Nel terminale del Certificatore: Controllare le nuove richieste di certificazione"
echo "4. Nel terminale del Certificatore: Certificare la partita di vino"
echo "5. Nel terminale del Certificatore: Inviare la partita certificata al Rivenditore"
echo "6. Nel terminale del Rivenditore: Controllare le nuove spedizioni in arrivo"
echo "7. Nel terminale del Rivenditore: Registrare l'arrivo della partita"
echo "8. Nel terminale del Rivenditore: Vendere alcune bottiglie dalla partita"
echo "9. Nel terminale del Rivenditore: Verificare l'autenticità di una bottiglia"

echo -e "\nAvvio di terminali separati automaticamente? (y/n): "
read AUTO_START

if [[ "$AUTO_START" = "y" || "$AUTO_START" = "Y" ]]; then
    # Se siamo su macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Avvio dei CLI in terminali separati..."
        osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && ./producer/wine-producer-cli.js"'
        osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && ./certifier/wine-certifier-cli.js"'
        osascript -e 'tell application "Terminal" to do script "cd \"'$PWD'\" && ./retailer/wine-retailer-cli.js"'
    # Se siamo su Linux e abbiamo gnome-terminal
    elif command -v gnome-terminal &> /dev/null; then
        echo "Avvio dei CLI in terminali separati..."
        gnome-terminal -- bash -c "cd \"$PWD\" && ./producer/wine-producer-cli.js; exec bash"
        gnome-terminal -- bash -c "cd \"$PWD\" && ./certifier/wine-certifier-cli.js; exec bash"
        gnome-terminal -- bash -c "cd \"$PWD\" && ./retailer/wine-retailer-cli.js; exec bash"
    # Se siamo su Linux e abbiamo xterm
    elif command -v xterm &> /dev/null; then
        echo "Avvio dei CLI in terminali separati..."
        xterm -e "cd \"$PWD\" && ./producer/wine-producer-cli.js" &
        xterm -e "cd \"$PWD\" && ./certifier/wine-certifier-cli.js" &
        xterm -e "cd \"$PWD\" && ./retailer/wine-retailer-cli.js" &
    else
        echo "Impossibile aprire terminali automaticamente in questo ambiente."
        echo "Per favore apri 3 terminali separati e segui le istruzioni sopra."
    fi
else
    echo -e "\nPer favore apri 3 terminali separati e segui le istruzioni sopra."
fi

echo -e "\nNota: Ogni CLI avvierà automaticamente il nodo IperChain se non è già in esecuzione."
echo "Buon divertimento con il sistema di tracciabilità del vino su blockchain!" 