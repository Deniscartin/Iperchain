#!/usr/bin/env node

/**
 * Wine Retailer CLI
 * 
 * Command line interface for wine retailers to:
 * - Receive certified wine batches
 * - Record arrival of wine batches
 * - Sell bottles from batches
 * - Verify wine bottle authenticity
 * - Generate QR codes for wine bottles
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');

// Configuration
const RETAILER_ACCOUNT = '0x456f681646d4a755815f9cb19e1acc8565a0c2ac';
const BLOCKCHAIN_PORT = 8545;
const DB_FILE = path.join(__dirname, 'retailer-batches.json');

// Ensure DB files exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    incoming: {},
    inventory: {},
    sales: []
  }));
}

// Load data
let retailerDB = {
  incoming: {},
  inventory: {},
  sales: []
};

try {
  retailerDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  // Ensure proper structure
  if (!retailerDB.incoming) retailerDB.incoming = {};
  if (!retailerDB.inventory) retailerDB.inventory = {};
  if (!retailerDB.sales) retailerDB.sales = [];
} catch (error) {
  console.error('Error loading retailer database:', error.message);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// IperChain node process
let nodeProcess = null;

// JSON-RPC call helper
function rpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    });

    const options = {
      hostname: 'localhost',
      port: BLOCKCHAIN_PORT,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          
          if (response.error) {
            console.log(`RPC Error in ${method}:`, response.error);
            reject(response.error);
          } else {
            resolve(response.result);
          }
        } catch (error) {
          console.error(`Failed to parse response for ${method}:`, error.message);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`Request failed for ${method}:`, error.message);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Start IperChain node
async function startNode() {
  return new Promise(async (resolve) => {
    try {
      // Check if node is already running
      try {
        const blockNumber = await rpcCall('eth_blockNumber');
        if (blockNumber !== null) {
          console.log('IperChain node is already running at block:', blockNumber);
          resolve(true);
          return;
        }
      } catch (error) {
        // Node not running, continue to start it
      }
      
      console.log('Starting IperChain node...');
      nodeProcess = spawn('node', ['bin/iperchain-node.js'], {
        detached: true,
        stdio: 'ignore'
      });
      
      // Give the node time to start
      console.log('Waiting for node to start...');
      
      // Try to connect to the node several times
      let attempts = 0;
      const maxAttempts = 5;
      let success = false;
      
      while (attempts < maxAttempts && !success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        
        try {
          const blockNumber = await rpcCall('eth_blockNumber');
          if (blockNumber !== null) {
            console.log('IperChain node started successfully at block:', blockNumber);
            success = true;
          }
        } catch (error) {
          console.log(`Attempt ${attempts}/${maxAttempts} to connect to node failed`);
        }
      }
      
      if (success) {
        resolve(true);
      } else {
        console.error('Failed to start IperChain node after several attempts');
        resolve(false);
      }
    } catch (error) {
      console.error('Error starting IperChain node:', error.message);
      resolve(false);
    }
  });
}

// Check for incoming shipments
function checkIncomingShipments() {
  const incomingFolder = path.join(__dirname, '..', 'shared-data', 'retailer', 'incoming');
  
  // Ensure the directory exists
  if (!fs.existsSync(incomingFolder)) {
    fs.mkdirSync(incomingFolder, { recursive: true });
    return [];
  }
  
  const newShipments = [];
  
  // Read all shipping files
  const files = fs.readdirSync(incomingFolder);
  
  for (const file of files) {
    if (file.startsWith('shipping-') && file.endsWith('.json')) {
      try {
        const shipment = JSON.parse(fs.readFileSync(path.join(incomingFolder, file), 'utf8'));
        
        // Add to incoming batches if not already there
        if (shipment.batchId && !retailerDB.incoming[shipment.batchId]) {
          retailerDB.incoming[shipment.batchId] = {
            ...shipment,
            receivedAt: Math.floor(Date.now() / 1000)
          };
          
          newShipments.push(shipment);
          
          // Remove the file after processing
          fs.unlinkSync(path.join(incomingFolder, file));
        }
      } catch (error) {
        console.error(`Error processing shipment file ${file}:`, error.message);
      }
    }
  }
  
  // Save updated database
  if (newShipments.length > 0) {
    fs.writeFileSync(DB_FILE, JSON.stringify(retailerDB, null, 2));
  }
  
  return newShipments;
}

// Record batch arrival on blockchain
async function recordBatchArrival(batchId, arrivalNotes) {
  if (!retailerDB.incoming[batchId]) {
    throw new Error('Batch not found in incoming shipments');
  }
  
  const batch = retailerDB.incoming[batchId];
  
  // Create an arrival data structure
  const arrivalData = {
    batchId,
    retailer: RETAILER_ACCOUNT,
    retailerName: "Premium Wine Shop",
    arrivalTimestamp: Math.floor(Date.now() / 1000),
    arrivalNotes,
    certifications: batch.certifications,
    producer: batch.producer,
    certifier: batch.certifier,
    batchName: batch.batchName
  };
  
  // Serialize the data
  const dataString = JSON.stringify(arrivalData);
  
  // Prefix to indicate this is a wine batch arrival
  const dataPrefix = 'WINE_BATCH_ARRIVAL:';
  
  // Encode the data to hexadecimal for sending in a transaction
  const hexData = '0x' + Buffer.from(dataPrefix + dataString).toString('hex');
  
  console.log(`Recording arrival of wine batch "${batch.batchName}" with ID: ${batchId}`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: RETAILER_ACCOUNT,
      to: batch.producer, // Send to the producer's address
      value: '0x0', // No value transfer
      data: hexData,
      gas: '0x100000'
    }
  ]);
  
  // Wait for transaction confirmation
  let receipt = null;
  let attempts = 0;
  const maxAttempts = 5;
  
  while (!receipt && attempts < maxAttempts) {
    console.log(`Waiting for confirmation (attempt ${attempts + 1})...`);
    receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
    
    if (!receipt) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
  }
  
  if (receipt) {
    console.log('Batch arrival recorded on blockchain!');
    
    // Move from incoming to inventory
    const inventoryBatch = {
      ...batch,
      arrivalNotes,
      arrivalTimestamp: Math.floor(Date.now() / 1000),
      arrivalTransactionHash: txHash,
      remainingBottles: 100, // Default number of bottles per batch
      status: "In Stock"
    };
    
    // Update databases
    delete retailerDB.incoming[batchId];
    retailerDB.inventory[batchId] = inventoryBatch;
    fs.writeFileSync(DB_FILE, JSON.stringify(retailerDB, null, 2));
    
    return { batchId, txHash };
  } else {
    console.log('Arrival recording not confirmed after several attempts');
    throw new Error('Transaction not confirmed');
  }
}

// Record bottle sale
function recordBottleSale(batchId, numBottles, customerInfo) {
  if (!retailerDB.inventory[batchId]) {
    throw new Error('Batch not found in inventory');
  }
  
  const batch = retailerDB.inventory[batchId];
  
  if (batch.remainingBottles < numBottles) {
    throw new Error(`Not enough bottles remaining. Only ${batch.remainingBottles} in stock.`);
  }
  
  // Create bottle identifiers
  const bottles = [];
  for (let i = 0; i < numBottles; i++) {
    const bottleId = crypto.createHash('sha256').update(`${batchId}-${Math.random()}-${Date.now()}-${i}`).digest('hex');
    
    // Create sale record
    const sale = {
      bottleId,
      batchId,
      batchName: batch.batchName,
      soldTimestamp: Math.floor(Date.now() / 1000),
      customerInfo,
      certifications: batch.certifications,
      producer: batch.producer,
      producerName: batch.producerName,
      certifier: batch.certifier,
      certifierName: batch.certifierName,
      retailer: RETAILER_ACCOUNT,
      retailerName: "Premium Wine Shop"
    };
    
    retailerDB.sales.push(sale);
    bottles.push({ bottleId, batchId });
  }
  
  // Update inventory
  batch.remainingBottles -= numBottles;
  if (batch.remainingBottles <= 0) {
    batch.status = "Sold Out";
  }
  
  // Save database
  fs.writeFileSync(DB_FILE, JSON.stringify(retailerDB, null, 2));
  
  return bottles;
}

// Verify batch on blockchain
async function verifyBatch(batchId) {
  console.log(`Verifying batch ${batchId} on blockchain...`);
  
  // Get latest block number
  const blockNumber = await rpcCall('eth_blockNumber');
  const numBlocks = parseInt(blockNumber, 16);
  
  console.log(`Scanning ${numBlocks} blocks for batch history...`);
  
  const batchHistory = [];
  const prefixes = ['WINE_BATCH_REGISTRATION:', 'WINE_BATCH_CERTIFICATION:', 'WINE_BATCH_ARRIVAL:'];
  
  // Scan blockchain for all events related to this batch
  for (let i = 0; i < numBlocks; i++) {
    const blockNumberHex = '0x' + i.toString(16);
    const block = await rpcCall('eth_getBlockByNumber', [blockNumberHex, true]);
    
    if (block && block.transactions) {
      for (const tx of block.transactions) {
        if (tx.input && tx.input.length > 2) { // Not empty data
          try {
            // Convert hex to string
            const hexData = tx.input.substring(2); // Remove 0x prefix
            const stringData = Buffer.from(hexData, 'hex').toString('utf8');
            
            // Check if this is a wine batch transaction
            const prefix = prefixes.find(p => stringData.startsWith(p));
            
            if (prefix) {
              // Extract the JSON part
              const jsonData = stringData.substring(prefix.length);
              const data = JSON.parse(jsonData);
              
              // Check if this transaction is for our batch
              if (data.batchId && data.batchId.toLowerCase() === batchId.toLowerCase()) {
                batchHistory.push({
                  type: prefix.replace(':', ''),
                  data,
                  transaction: {
                    hash: tx.hash,
                    from: tx.from,
                    to: tx.to,
                    blockNumber: blockNumberHex,
                    timestamp: block.timestamp ? parseInt(block.timestamp, 16) : 0
                  }
                });
              }
            }
          } catch (e) {
            // Not a valid data transaction or not in the expected format
            // This is expected for most transactions
          }
        }
      }
    }
  }
  
  // Sort by timestamp if available
  batchHistory.sort((a, b) => {
    return a.transaction.timestamp - b.transaction.timestamp;
  });
  
  return batchHistory;
}

// Verify bottle authenticity
function verifyBottle(bottleId) {
  // Look up in sales records
  const sale = retailerDB.sales.find(s => s.bottleId === bottleId);
  
  if (!sale) {
    // Try to find by partial ID if exact match not found
    const matchingSales = retailerDB.sales.filter(s => 
      s.bottleId.toLowerCase().includes(bottleId.toLowerCase()) || 
      bottleId.toLowerCase().includes(s.bottleId.substring(0, 8).toLowerCase())
    );
    
    if (matchingSales.length === 1) {
      console.log(`Nota: Bottiglia trovata con ID parziale. ID completo: ${matchingSales[0].bottleId}`);
      return matchingSales[0];
    } else if (matchingSales.length > 1) {
      console.log(`Trovate ${matchingSales.length} bottiglie con ID simili. Si prega di fornire un ID più specifico.`);
      matchingSales.forEach((match, i) => {
        console.log(`${i+1}. ${match.bottleId}`);
      });
      throw new Error('ID bottiglia ambiguo - più corrispondenze trovate');
    }
    
    throw new Error('Bottle not found in sales records');
  }
  
  return sale;
}

// Generate QR code data for a bottle
function generateBottleQRCode(bottleId) {
  try {
    // Usa la funzione verifyBottle migliorata che ora supporta ID parziali
    const bottle = verifyBottle(bottleId);
    const verificationUrl = `https://iperwine.example.com/verify-bottle/${bottle.bottleId}`;
    
    const qrData = {
      type: "wine_bottle",
      bottleId: bottle.bottleId,
      batchId: bottle.batchId,
      batchName: bottle.batchName,
      producer: bottle.producerName,
      retailer: bottle.retailerName,
      certifications: bottle.certifications,
      verifyUrl: verificationUrl
    };
    
    // We're not actually generating a QR code image here, just the data that would go in it
    return {
      bottleId: bottle.bottleId,
      verificationUrl,
      qrContent: JSON.stringify(qrData)
    };
  } catch (error) {
    throw error;
  }
}

// Main menu function
function showMainMenu() {
  console.clear();
  console.log('\n=== WINE RETAILER CLI ===');
  console.log('1. Check for incoming shipments');
  console.log('2. View incoming shipments');
  console.log('3. View inventory');
  console.log('4. Record batch arrival');
  console.log('5. Sell bottles from batch');
  console.log('6. Verify batch on blockchain');
  console.log('7. Verify bottle authenticity');
  console.log('8. Generate bottle QR code');
  console.log('9. Exit');
  
  rl.question('\nSelect an option: ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        await checkShipmentsMenu();
        break;
      case '2':
        await viewIncomingMenu();
        break;
      case '3':
        await viewInventoryMenu();
        break;
      case '4':
        await recordArrivalMenu();
        break;
      case '5':
        await sellBottlesMenu();
        break;
      case '6':
        await verifyBatchMenu();
        break;
      case '7':
        await verifyBottleMenu();
        break;
      case '8':
        await generateQRMenu();
        break;
      case '9':
        cleanupAndExit();
        break;
      default:
        console.log('\nInvalid option. Please try again.');
        setTimeout(showMainMenu, 1500);
    }
  });
}

// Check shipments menu
async function checkShipmentsMenu() {
  console.clear();
  console.log('\n=== CHECK INCOMING SHIPMENTS ===');
  
  console.log('\nChecking for new incoming shipments...');
  const newShipments = checkIncomingShipments();
  
  if (newShipments.length === 0) {
    console.log('\nNo new shipments found.');
  } else {
    console.log(`\nFound ${newShipments.length} new shipments:`);
    
    newShipments.forEach((shipment, index) => {
      console.log(`\n${index + 1}. ${shipment.batchName}`);
      console.log(`   From: ${shipment.producerName} via ${shipment.certifierName}`);
      console.log(`   Batch ID: ${shipment.batchId.substring(0, 8)}...`);
      console.log(`   Certifications: ${shipment.certifications.join(', ')}`);
      console.log(`   Shipping Date: ${new Date(shipment.shippingTimestamp * 1000).toLocaleString()}`);
    });
  }
  
  rl.question('\nPress Enter to return to main menu...', () => {
    showMainMenu();
  });
}

// View incoming menu
async function viewIncomingMenu() {
  console.clear();
  console.log('\n=== INCOMING SHIPMENTS ===');
  
  const incomingBatches = Object.values(retailerDB.incoming);
  
  if (incomingBatches.length === 0) {
    console.log('\nNo incoming shipments to display.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log(`\nTotal Incoming Shipments: ${incomingBatches.length}\n`);
  
  incomingBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
    console.log(`   From: ${batch.producerName} via ${batch.certifierName}`);
    console.log(`   Certifications: ${batch.certifications.join(', ')}`);
    console.log(`   Received: ${new Date(batch.receivedAt * 1000).toLocaleString()}`);
    console.log('');
  });
  
  rl.question('\nEnter shipment number for details (or 0 to return to main menu): ', (answer) => {
    const batchIndex = parseInt(answer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < incomingBatches.length) {
      const batch = incomingBatches[batchIndex];
      console.clear();
      console.log('\n=== SHIPMENT DETAILS ===');
      console.log(JSON.stringify(batch, null, 2));
      
      rl.question('\nPress Enter to return to incoming list...', () => {
        viewIncomingMenu();
      });
    } else {
      console.log('\nInvalid shipment number.');
      setTimeout(viewIncomingMenu, 1500);
    }
  });
}

// View inventory menu
async function viewInventoryMenu() {
  console.clear();
  console.log('\n=== INVENTORY ===');
  
  const inventoryBatches = Object.values(retailerDB.inventory);
  
  if (inventoryBatches.length === 0) {
    console.log('\nNo batches in inventory.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log(`\nTotal Batches in Inventory: ${inventoryBatches.length}\n`);
  
  inventoryBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
    console.log(`   Status: ${batch.status}`);
    console.log(`   Remaining Bottles: ${batch.remainingBottles}`);
    console.log(`   Certifications: ${batch.certifications.join(', ')}`);
    console.log(`   Arrival: ${new Date(batch.arrivalTimestamp * 1000).toLocaleString()}`);
    console.log('');
  });
  
  rl.question('\nEnter batch number for details (or 0 to return to main menu): ', (answer) => {
    const batchIndex = parseInt(answer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < inventoryBatches.length) {
      const batch = inventoryBatches[batchIndex];
      console.clear();
      console.log('\n=== BATCH DETAILS ===');
      console.log(JSON.stringify(batch, null, 2));
      
      rl.question('\nPress Enter to return to inventory list...', () => {
        viewInventoryMenu();
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(viewInventoryMenu, 1500);
    }
  });
}

// Record arrival menu
async function recordArrivalMenu() {
  console.clear();
  console.log('\n=== RECORD BATCH ARRIVAL ===');
  
  const incomingBatches = Object.values(retailerDB.incoming);
  
  if (incomingBatches.length === 0) {
    console.log('\nNo incoming batches to record.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nIncoming batches:');
  incomingBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
  });
  
  rl.question('\nSelect batch number to record arrival (or 0 to return to main menu): ', (batchAnswer) => {
    const batchIndex = parseInt(batchAnswer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < incomingBatches.length) {
      const batch = incomingBatches[batchIndex];
      console.log(`\nRecording arrival of batch: ${batch.batchName}`);
      
      rl.question('\nArrival notes (condition, etc.): ', async (notes) => {
        try {
          console.log('\nRecording arrival on blockchain...');
          const result = await recordBatchArrival(
            batch.batchId,
            notes
          );
          
          console.log(`\nBatch arrival recorded successfully!`);
          console.log(`Batch ID: ${result.batchId}`);
          console.log(`Transaction Hash: ${result.txHash}`);
          
          rl.question('\nPress Enter to return to main menu...', () => {
            showMainMenu();
          });
        } catch (error) {
          console.error('\nError recording arrival:', error.message);
          rl.question('\nPress Enter to return to main menu...', () => {
            showMainMenu();
          });
        }
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(recordArrivalMenu, 1500);
    }
  });
}

// Sell bottles menu
async function sellBottlesMenu() {
  console.clear();
  console.log('\n=== SELL BOTTLES ===');
  
  const inventoryBatches = Object.values(retailerDB.inventory).filter(b => 
    b.status === 'In Stock' && b.remainingBottles > 0
  );
  
  if (inventoryBatches.length === 0) {
    console.log('\nNo batches with available bottles.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nAvailable batches:');
  inventoryBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (${batch.remainingBottles} bottles available)`);
  });
  
  rl.question('\nSelect batch number (or 0 to return to main menu): ', (batchAnswer) => {
    const batchIndex = parseInt(batchAnswer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < inventoryBatches.length) {
      const batch = inventoryBatches[batchIndex];
      
      rl.question(`\nHow many bottles to sell (max ${batch.remainingBottles}): `, (numBottlesStr) => {
        const numBottles = parseInt(numBottlesStr.trim());
        
        if (isNaN(numBottles) || numBottles <= 0 || numBottles > batch.remainingBottles) {
          console.log('\nInvalid number of bottles.');
          setTimeout(sellBottlesMenu, 1500);
          return;
        }
        
        rl.question('\nCustomer name: ', (customerName) => {
          rl.question('\nCustomer email (optional): ', (customerEmail) => {
            try {
              console.log(`\nRecording sale of ${numBottles} bottles from batch ${batch.batchName}...`);
              
              const customerInfo = {
                name: customerName,
                email: customerEmail || 'Not provided'
              };
              
              const bottles = recordBottleSale(
                batch.batchId,
                numBottles,
                customerInfo
              );
              
              console.log(`\nSale recorded successfully!`);
              console.log(`Sold ${numBottles} bottles from batch ${batch.batchName}`);
              console.log(`Remaining bottles in batch: ${batch.remainingBottles}`);
              
              console.log('\nBottle IDs:');
              bottles.forEach((bottle, i) => {
                console.log(`${i + 1}. ${bottle.bottleId}`);
                console.log(`   (ID completo: ${bottle.bottleId})`);
              });
              
              rl.question('\nPress Enter to return to main menu...', () => {
                showMainMenu();
              });
            } catch (error) {
              console.error('\nError recording sale:', error.message);
              rl.question('\nPress Enter to return to main menu...', () => {
                showMainMenu();
              });
            }
          });
        });
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(sellBottlesMenu, 1500);
    }
  });
}

// Verify batch menu
async function verifyBatchMenu() {
  console.clear();
  console.log('\n=== VERIFY BATCH ===');
  
  rl.question('\nEnter batch ID to verify: ', async (batchId) => {
    try {
      console.log(`\nVerifying batch ${batchId} on blockchain...`);
      const history = await verifyBatch(batchId);
      
      if (history.length === 0) {
        console.log('\nNo records found for this batch ID on the blockchain.');
      } else {
        console.log(`\nFound ${history.length} records for batch on blockchain:`);
        
        history.forEach((event, index) => {
          console.log(`\n${index + 1}. ${event.type}`);
          console.log(`   Transaction: ${event.transaction.hash}`);
          console.log(`   Block: ${parseInt(event.transaction.blockNumber, 16)}`);
          console.log(`   Timestamp: ${new Date(event.transaction.timestamp * 1000).toLocaleString()}`);
          
          // Display relevant info based on event type
          if (event.type === 'WINE_BATCH_REGISTRATION') {
            console.log(`   Producer: ${event.data.producer}`);
            console.log(`   Name: ${event.data.batchName}`);
            console.log(`   Grape: ${event.data.grapeVariety}`);
            console.log(`   Location: ${event.data.location}`);
          } else if (event.type === 'WINE_BATCH_CERTIFICATION') {
            console.log(`   Certifier: ${event.data.certifierName}`);
            console.log(`   Certifications: ${event.data.certifications.join(', ')}`);
          } else if (event.type === 'WINE_BATCH_ARRIVAL') {
            console.log(`   Retailer: ${event.data.retailerName}`);
            console.log(`   Arrival Notes: ${event.data.arrivalNotes}`);
          }
        });
      }
      
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    } catch (error) {
      console.error('\nError verifying batch:', error.message);
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    }
  });
}

// Verify bottle menu
async function verifyBottleMenu() {
  console.clear();
  console.log('\n=== VERIFY BOTTLE ===');
  
  rl.question('\nEnter bottle ID to verify: ', (bottleId) => {
    try {
      const bottle = verifyBottle(bottleId);
      
      console.log('\n=== BOTTLE VERIFICATION RESULT ===');
      console.log(`\nBottle ID: ${bottleId}`);
      console.log(`Batch: ${bottle.batchName}`);
      console.log(`Producer: ${bottle.producerName}`);
      console.log(`Certifier: ${bottle.certifierName}`);
      console.log(`Retailer: ${bottle.retailerName}`);
      console.log(`Sale Date: ${new Date(bottle.soldTimestamp * 1000).toLocaleString()}`);
      console.log(`Certifications: ${bottle.certifications.join(', ')}`);
      console.log(`\nThis bottle is authentic and its provenance has been verified.`);
      
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    } catch (error) {
      console.error('\nError verifying bottle:', error.message);
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    }
  });
}

// Generate QR code menu
async function generateQRMenu() {
  console.clear();
  console.log('\n=== GENERATE BOTTLE QR CODE ===');
  
  rl.question('\nEnter bottle ID to generate QR code: ', (bottleId) => {
    try {
      const qrData = generateBottleQRCode(bottleId);
      
      console.log('\n=== QR CODE DATA ===');
      console.log(`\nBottle ID: ${qrData.bottleId}`);
      console.log(`Verification URL: ${qrData.verificationUrl}`);
      console.log(`\nQR Content:`);
      console.log(qrData.qrContent);
      console.log(`\nThis data would be encoded in a QR code to place on the bottle.`);
      
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    } catch (error) {
      console.error('\nError generating QR code:', error.message);
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    }
  });
}

// Cleanup and exit
function cleanupAndExit() {
  console.log('\nSaving data and exiting...');
  
  // Save database
  fs.writeFileSync(DB_FILE, JSON.stringify(retailerDB, null, 2));
  
  if (nodeProcess) {
    console.log('Stopping IperChain node...');
    // In a real implementation, we might want to keep the node running
    // nodeProcess.kill();
  }
  
  console.log('Goodbye!');
  process.exit(0);
}

// Start the application
async function start() {
  console.log('\nWine Retailer CLI Starting...');
  
  // Create shared data directories
  const sharedDirs = [
    path.join(__dirname, '..', 'shared-data', 'retailer', 'incoming')
  ];
  
  for (const dir of sharedDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  // Start blockchain node
  await startNode();
  
  // Show main menu
  showMainMenu();
}

// Handle exit
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// Start the application
start(); 