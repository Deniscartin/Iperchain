#!/usr/bin/env node

/**
 * IperChain Wine Supply Chain CLI
 * 
 * Unified command line interface for the wine supply chain:
 * - Producer: register batches, transfer to other actors
 * - Certifier: certify wine batches
 * - Distributor: quality checks, transfer to retailers
 * - Retailer: manage inventory, record sales
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');

// Configuration
const BLOCKCHAIN_PORT = 8545;
const P2P_PORT = 9546;
const DB_DIR = path.join(__dirname, 'data');
const ACCOUNTS = {
  PRODUCER: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  CERTIFIER: '0x123f681646d4a755815f9cb19e1acc8565a0c2ac',
  DISTRIBUTOR: '0x456f681646d4a755815f9cb19e1acc8565a0c2ac',
  RETAILER: '0x999f681646d4a755815f9cb19e1acc8565a0c2ac'
};

// Ensure the data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Create database files if they don't exist
const DB_FILES = {
  BATCHES: path.join(DB_DIR, 'wine-batches.json'),
  CERTIFICATIONS: path.join(DB_DIR, 'certifications.json'),
  TRANSFERS: path.join(DB_DIR, 'transfers.json'),
  QUALITY_CHECKS: path.join(DB_DIR, 'quality-checks.json'),
  SALES: path.join(DB_DIR, 'sales.json')
};

for (const file of Object.values(DB_FILES)) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({}));
  }
}

// Load data
const data = {
  batches: loadJson(DB_FILES.BATCHES),
  certifications: loadJson(DB_FILES.CERTIFICATIONS),
  transfers: loadJson(DB_FILES.TRANSFERS),
  qualityChecks: loadJson(DB_FILES.QUALITY_CHECKS),
  sales: loadJson(DB_FILES.SALES)
};

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return {};
  }
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error.message);
  }
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// IperChain node and P2P processes
let nodeProcess = null;
let p2pNodeProcess = null;
let currentRole = null;

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

// Start test P2P network
async function startTestP2P() {
  console.log('Starting P2P test network...');
  
  try {
    p2pNodeProcess = spawn('node', ['test/wine-supply-chain-test.js'], {
      detached: true,
      stdio: 'ignore'
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('P2P test network started');
    return true;
  } catch (error) {
    console.error('Error starting P2P test network:', error);
    return false;
  }
}

// ===== PRODUCER FUNCTIONS =====

// Register a wine batch
async function registerWineBatch(batchName, vintage, varietal, region, quantity, bottleSize, additionalDetails) {
  // Create a data structure for the wine batch
  const wineBatch = {
    id: `BATCH_${vintage}_${Date.now().toString().substring(8)}`,
    producer: ACCOUNTS.PRODUCER,
    batchName,
    vintage,
    varietal,
    region,
    quantity,
    bottleSize,
    productionDate: new Date().toISOString(),
    additionalDetails,
    status: 'PRODUCED'
  };
  
  // Serialize the data
  const batchData = JSON.stringify(wineBatch);
  
  // Create a unique identifier for the batch if not already present
  if (!wineBatch.id) {
    wineBatch.id = crypto.createHash('sha256').update(batchData).digest('hex');
  }
  
  // Prefix to indicate this is a wine batch registration
  const dataPrefix = 'WINE_BATCH_REGISTRATION:';
  
  // Encode the data to hexadecimal for sending in a transaction
  const hexData = '0x' + Buffer.from(dataPrefix + batchData).toString('hex');
  
  console.log(`Registering wine batch "${batchName}" with ID: ${wineBatch.id}`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: ACCOUNTS.PRODUCER,
      to: ACCOUNTS.PRODUCER, // We send to ourselves to store the data
      value: '0x0', // No value transfer
      data: hexData,
      gas: '0x100000'
    }
  ]);
  
  console.log(`Transaction submitted: ${txHash}`);
  console.log('Waiting for confirmation...');
  
  // Wait for transaction confirmation
  let receipt = null;
  let attempts = 0;
  const maxAttempts = 5;
  
  while (!receipt && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
  }
  
  if (!receipt) {
    console.log('Transaction is taking longer than expected to confirm. Continuing anyway...');
  } else {
    console.log('Transaction confirmed in block:', receipt.blockNumber);
  }
  
  // Save to local database
  data.batches[wineBatch.id] = wineBatch;
  saveJson(DB_FILES.BATCHES, data.batches);
  
  console.log(`Wine batch registered successfully with ID: ${wineBatch.id}`);
  return wineBatch;
}

// Transfer a batch to another actor
async function transferBatch(batchId, to, transportConditions) {
  if (!data.batches[batchId]) {
    console.error(`Batch ${batchId} not found`);
    return null;
  }
  
  const batch = data.batches[batchId];
  const from = currentRole === 'PRODUCER' ? ACCOUNTS.PRODUCER : 
               currentRole === 'CERTIFIER' ? ACCOUNTS.CERTIFIER :
               currentRole === 'DISTRIBUTOR' ? ACCOUNTS.DISTRIBUTOR : ACCOUNTS.RETAILER;
  
  const transfer = {
    batchId,
    from,
    to,
    transferDate: new Date().toISOString(),
    quantity: batch.quantity,
    transportConditions,
    status: 'TRANSFERRED'
  };
  
  const transferId = `TRANSFER_${batchId}_${Date.now()}`;
  
  // Prepare transaction
  const dataPrefix = 'WINE_BATCH_TRANSFER:';
  const transferData = JSON.stringify(transfer);
  const hexData = '0x' + Buffer.from(dataPrefix + transferData).toString('hex');
  
  console.log(`Transferring batch ${batchId} to ${to}...`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from,
      to, // Send to the recipient
      value: '0x0',
      data: hexData,
      gas: '0x100000'
    }
  ]);
  
  console.log(`Transfer transaction submitted: ${txHash}`);
  
  // Update the batch status
  batch.status = 'TRANSFERRED';
  data.batches[batchId] = batch;
  saveJson(DB_FILES.BATCHES, data.batches);
  
  // Save the transfer record
  data.transfers[transferId] = transfer;
  saveJson(DB_FILES.TRANSFERS, data.transfers);
  
  console.log(`Batch ${batchId} transferred successfully`);
  return transfer;
}

// ===== CERTIFIER FUNCTIONS =====

// Certify a wine batch
async function certifyBatch(batchId, certificationDetails) {
  if (!data.batches[batchId]) {
    console.error(`Batch ${batchId} not found`);
    return null;
  }
  
  const certification = {
    batchId,
    certifier: ACCOUNTS.CERTIFIER,
    certificationDate: new Date().toISOString(),
    ...certificationDetails,
    status: 'CERTIFIED'
  };
  
  const certificationId = `CERT_${batchId}_${Date.now()}`;
  
  // Prepare transaction
  const dataPrefix = 'WINE_BATCH_CERTIFICATION:';
  const certData = JSON.stringify(certification);
  const hexData = '0x' + Buffer.from(dataPrefix + certData).toString('hex');
  
  console.log(`Certifying batch ${batchId}...`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: ACCOUNTS.CERTIFIER,
      to: ACCOUNTS.PRODUCER, // Send to the batch producer
      value: '0x0',
      data: hexData,
      gas: '0x100000'
    }
  ]);
  
  console.log(`Certification transaction submitted: ${txHash}`);
  
  // Update the batch status
  const batch = data.batches[batchId];
  batch.status = 'CERTIFIED';
  data.batches[batchId] = batch;
  saveJson(DB_FILES.BATCHES, data.batches);
  
  // Save the certification record
  data.certifications[certificationId] = certification;
  saveJson(DB_FILES.CERTIFICATIONS, data.certifications);
  
  console.log(`Batch ${batchId} certified successfully`);
  return certification;
}

// ===== DISTRIBUTOR FUNCTIONS =====

// Perform quality check on a batch
async function performQualityCheck(batchId, checkDetails) {
  if (!data.batches[batchId]) {
    console.error(`Batch ${batchId} not found`);
    return null;
  }
  
  const qualityCheck = {
    batchId,
    inspector: ACCOUNTS.DISTRIBUTOR,
    checkDate: new Date().toISOString(),
    ...checkDetails,
    status: 'QUALITY_CHECKED'
  };
  
  const checkId = `CHECK_${batchId}_${Date.now()}`;
  
  // Prepare transaction
  const dataPrefix = 'WINE_BATCH_QUALITY_CHECK:';
  const checkData = JSON.stringify(qualityCheck);
  const hexData = '0x' + Buffer.from(dataPrefix + checkData).toString('hex');
  
  console.log(`Recording quality check for batch ${batchId}...`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: ACCOUNTS.DISTRIBUTOR,
      to: ACCOUNTS.PRODUCER, // Send to the batch producer
      value: '0x0',
      data: hexData,
      gas: '0x100000'
    }
  ]);
  
  console.log(`Quality check transaction submitted: ${txHash}`);
  
  // Update the batch status
  const batch = data.batches[batchId];
  batch.status = 'QUALITY_CHECKED';
  data.batches[batchId] = batch;
  saveJson(DB_FILES.BATCHES, data.batches);
  
  // Save the quality check record
  data.qualityChecks[checkId] = qualityCheck;
  saveJson(DB_FILES.QUALITY_CHECKS, data.qualityChecks);
  
  console.log(`Quality check for batch ${batchId} recorded successfully`);
  return qualityCheck;
}

// ===== RETAILER FUNCTIONS =====

// Record a retail sale
async function recordSale(batchId, saleDetails) {
  if (!data.batches[batchId]) {
    console.error(`Batch ${batchId} not found`);
    return null;
  }
  
  const bottleId = `${batchId}_BOTTLE_${Date.now().toString().substring(8)}`;
  
  const retailSale = {
    bottleId,
    batchId,
    retailer: ACCOUNTS.RETAILER,
    saleDate: new Date().toISOString(),
    ...saleDetails,
    status: 'SOLD'
  };
  
  const saleId = `SALE_${bottleId}`;
  
  // Prepare transaction
  const dataPrefix = 'WINE_BOTTLE_SALE:';
  const saleData = JSON.stringify(retailSale);
  const hexData = '0x' + Buffer.from(dataPrefix + saleData).toString('hex');
  
  console.log(`Recording sale for bottle ${bottleId} from batch ${batchId}...`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: ACCOUNTS.RETAILER,
      to: ACCOUNTS.PRODUCER, // Send to the batch producer
      value: '0x0',
      data: hexData,
      gas: '0x100000'
    }
  ]);
  
  console.log(`Sale transaction submitted: ${txHash}`);
  
  // Update the batch remaining quantity
  const batch = data.batches[batchId];
  batch.quantity = parseInt(batch.quantity) - 1;
  saveJson(DB_FILES.BATCHES, data.batches);
  
  // Save the sale record
  data.sales[saleId] = retailSale;
  saveJson(DB_FILES.SALES, data.sales);
  
  console.log(`Sale for bottle ${bottleId} recorded successfully`);
  return retailSale;
}

// ===== MENU FUNCTIONS =====

async function showRoleSelectionMenu() {
  console.clear();
  console.log('=== IPERCHAIN WINE SUPPLY CHAIN ===');
  console.log('Select your role:');
  console.log('1. Wine Producer');
  console.log('2. Wine Certifier');
  console.log('3. Wine Distributor');
  console.log('4. Wine Retailer');
  console.log('0. Exit');
  
  const answer = await askQuestion('Enter your choice: ');
  
  switch (answer) {
    case '1':
      currentRole = 'PRODUCER';
      return showProducerMenu();
    case '2':
      currentRole = 'CERTIFIER';
      return showCertifierMenu();
    case '3':
      currentRole = 'DISTRIBUTOR';
      return showDistributorMenu();
    case '4':
      currentRole = 'RETAILER';
      return showRetailerMenu();
    case '0':
      return cleanupAndExit();
    default:
      console.log('Invalid choice, please try again');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return showRoleSelectionMenu();
  }
}

async function showProducerMenu() {
  console.clear();
  console.log('=== WINE PRODUCER MENU ===');
  console.log('1. Register new wine batch');
  console.log('2. View my batches');
  console.log('3. Send batch to certifier');
  console.log('4. View batch certifications');
  console.log('9. Change role');
  console.log('0. Exit');
  
  const answer = await askQuestion('Enter your choice: ');
  
  switch (answer) {
    case '1':
      await registerBatchMenu();
      break;
    case '2':
      await viewBatchesMenu();
      break;
    case '3':
      await sendToCertifierMenu();
      break;
    case '4':
      await viewCertificationsMenu();
      break;
    case '9':
      return showRoleSelectionMenu();
    case '0':
      return cleanupAndExit();
    default:
      console.log('Invalid choice, please try again');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  return showProducerMenu();
}

async function showCertifierMenu() {
  console.clear();
  console.log('=== WINE CERTIFIER MENU ===');
  console.log('1. View received batches');
  console.log('2. Certify a batch');
  console.log('3. Return batch to producer');
  console.log('4. Send batch to distributor');
  console.log('9. Change role');
  console.log('0. Exit');
  
  const answer = await askQuestion('Enter your choice: ');
  
  switch (answer) {
    case '1':
      await viewReceivedBatchesMenu();
      break;
    case '2':
      await certifyBatchMenu();
      break;
    case '3':
      await returnBatchMenu('PRODUCER');
      break;
    case '4':
      await sendToDistributorMenu();
      break;
    case '9':
      return showRoleSelectionMenu();
    case '0':
      return cleanupAndExit();
    default:
      console.log('Invalid choice, please try again');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  return showCertifierMenu();
}

async function showDistributorMenu() {
  console.clear();
  console.log('=== WINE DISTRIBUTOR MENU ===');
  console.log('1. View received batches');
  console.log('2. Perform quality check');
  console.log('3. Send batch to retailer');
  console.log('4. View quality checks');
  console.log('9. Change role');
  console.log('0. Exit');
  
  const answer = await askQuestion('Enter your choice: ');
  
  switch (answer) {
    case '1':
      await viewReceivedBatchesMenu();
      break;
    case '2':
      await qualityCheckMenu();
      break;
    case '3':
      await sendToRetailerMenu();
      break;
    case '4':
      await viewQualityChecksMenu();
      break;
    case '9':
      return showRoleSelectionMenu();
    case '0':
      return cleanupAndExit();
    default:
      console.log('Invalid choice, please try again');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  return showDistributorMenu();
}

async function showRetailerMenu() {
  console.clear();
  console.log('=== WINE RETAILER MENU ===');
  console.log('1. View received batches');
  console.log('2. Record a sale');
  console.log('3. View sales');
  console.log('4. Verify wine bottle');
  console.log('9. Change role');
  console.log('0. Exit');
  
  const answer = await askQuestion('Enter your choice: ');
  
  switch (answer) {
    case '1':
      await viewReceivedBatchesMenu();
      break;
    case '2':
      await recordSaleMenu();
      break;
    case '3':
      await viewSalesMenu();
      break;
    case '4':
      await verifyBottleMenu();
      break;
    case '9':
      return showRoleSelectionMenu();
    case '0':
      return cleanupAndExit();
    default:
      console.log('Invalid choice, please try again');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  return showRetailerMenu();
}

// This is a placeholder for all the submenu implementations
// They would be fully implemented in the complete version
async function registerBatchMenu() {
  console.clear();
  console.log('=== REGISTER NEW WINE BATCH ===');
  
  const batchName = await askQuestion('Enter batch name: ');
  const vintage = await askQuestion('Enter vintage year (e.g., 2024): ');
  const varietal = await askQuestion('Enter grape variety (e.g., Sangiovese): ');
  const region = await askQuestion('Enter region (e.g., Chianti Classico): ');
  const quantity = await askQuestion('Enter quantity of bottles: ');
  const bottleSize = await askQuestion('Enter bottle size (e.g., 750ml): ');
  const additionalDetails = await askQuestion('Enter any additional details: ');
  
  console.log('\nRegistering batch...');
  
  try {
    await registerWineBatch(
      batchName, 
      vintage, 
      varietal, 
      region, 
      quantity, 
      bottleSize, 
      additionalDetails
    );
    
    console.log('Batch registered successfully!');
  } catch (error) {
    console.error('Error registering batch:', error.message);
  }
  
  await askQuestion('\nPress Enter to continue...');
}

async function viewBatchesMenu() {
  console.clear();
  console.log('=== MY WINE BATCHES ===');
  
  const myAccount = currentRole === 'PRODUCER' ? ACCOUNTS.PRODUCER : 
                    currentRole === 'CERTIFIER' ? ACCOUNTS.CERTIFIER :
                    currentRole === 'DISTRIBUTOR' ? ACCOUNTS.DISTRIBUTOR : ACCOUNTS.RETAILER;
  
  const myBatches = Object.values(data.batches).filter(batch => batch.producer === myAccount);
  
  if (myBatches.length === 0) {
    console.log('No batches found');
  } else {
    console.log(`Found ${myBatches.length} batches:\n`);
    
    myBatches.forEach((batch, index) => {
      console.log(`${index + 1}. ${batch.batchName} (${batch.id})`);
      console.log(`   Vintage: ${batch.vintage}, Varietal: ${batch.varietal}`);
      console.log(`   Region: ${batch.region}, Quantity: ${batch.quantity}`);
      console.log(`   Status: ${batch.status}`);
      console.log(`   Production Date: ${new Date(batch.productionDate).toLocaleDateString()}`);
      console.log('');
    });
  }
  
  await askQuestion('\nPress Enter to continue...');
}

async function sendToCertifierMenu() {
  console.clear();
  console.log('=== SEND BATCH TO CERTIFIER ===');
  
  const myBatches = Object.values(data.batches).filter(
    batch => batch.producer === ACCOUNTS.PRODUCER && batch.status === 'PRODUCED'
  );
  
  if (myBatches.length === 0) {
    console.log('No eligible batches found');
    await askQuestion('\nPress Enter to continue...');
    return;
  }
  
  console.log('Select a batch to send:');
  myBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (${batch.id})`);
  });
  
  const batchIndex = parseInt(await askQuestion('\nEnter batch number: ')) - 1;
  
  if (isNaN(batchIndex) || batchIndex < 0 || batchIndex >= myBatches.length) {
    console.log('Invalid selection');
    await askQuestion('\nPress Enter to continue...');
    return;
  }
  
  const selectedBatch = myBatches[batchIndex];
  
  console.log(`\nPreparing to send batch "${selectedBatch.batchName}" to certifier...`);
  
  const transportTemp = await askQuestion('Enter transport temperature (e.g., 15C): ');
  const transportHumidity = await askQuestion('Enter transport humidity (e.g., 70%): ');
  const transporterId = await askQuestion('Enter transporter ID: ');
  
  const transportConditions = {
    temperature: transportTemp,
    humidity: transportHumidity,
    transporterId
  };
  
  try {
    await transferBatch(selectedBatch.id, ACCOUNTS.CERTIFIER, transportConditions);
    console.log('Batch sent to certifier successfully!');
  } catch (error) {
    console.error('Error sending batch:', error.message);
  }
  
  await askQuestion('\nPress Enter to continue...');
}

// Helper function for asking questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Cleanup and exit
function cleanupAndExit() {
  console.log('Cleaning up and exiting...');
  
  if (rl) {
    rl.close();
  }
  
  // Save all data
  for (const [key, value] of Object.entries(data)) {
    const fileName = Object.entries(DB_FILES).find(([k, v]) => k === key.toUpperCase())?.[1];
    if (fileName) {
      saveJson(fileName, value);
    }
  }
  
  console.log('Thank you for using IperChain Wine Supply Chain CLI');
  process.exit(0);
}

// Main function
async function main() {
  console.clear();
  console.log('=== IPERCHAIN WINE SUPPLY CHAIN CLI ===');
  console.log('Initializing...\n');
  
  // Start the IperChain node
  const nodeStarted = await startNode();
  if (!nodeStarted) {
    console.error('Failed to start IperChain node');
    cleanupAndExit();
    return;
  }
  
  // Start the test P2P network
  await startTestP2P();
  
  // Show the main menu
  await showRoleSelectionMenu();
}

// Start the CLI
main().catch(error => {
  console.error('Fatal error:', error);
  cleanupAndExit();
}); 