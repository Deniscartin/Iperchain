#!/usr/bin/env node

/**
 * Wine Producer CLI
 * 
 * Command line interface for wine producers to:
 * - Register new wine batches on the blockchain
 * - View registered batches
 * - Send batches to certifiers
 * - Check certification status
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');

// Configuration
const PRODUCER_ACCOUNT = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const BLOCKCHAIN_PORT = 8545;
const DB_FILE = path.join(__dirname, 'producer-batches.json');
const CERTIFIERS_FILE = path.join(__dirname, 'known-certifiers.json');

// Ensure DB files exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

if (!fs.existsSync(CERTIFIERS_FILE)) {
  fs.writeFileSync(CERTIFIERS_FILE, JSON.stringify([
    { id: 'certifier1', name: 'Premium Wine Certifications', address: '0x123f681646d4a755815f9cb19e1acc8565a0c2ac' }
  ]));
}

// Load data
let wineBatches = {};
try {
  wineBatches = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch (error) {
  console.error('Error loading batches database:', error.message);
  wineBatches = {};
}

let knownCertifiers = [];
try {
  knownCertifiers = JSON.parse(fs.readFileSync(CERTIFIERS_FILE, 'utf8'));
} catch (error) {
  console.error('Error loading certifiers database:', error.message);
  knownCertifiers = [];
}

// --- PoA Simulation Display Start ---
let lastBlockMiner = 'N/A';
let authorityNames = {
  '0x742d35Cc6634C0532925a3b844Bc454e4438f44e': 'Producer Authority',
  '0x123f681646d4a755815f9cb19e1acc8565a0c2ac': 'Certifier Authority',
  '0x456f681646d4a755815f9cb19e1acc8565a0c2ac': 'Retailer Authority',
  '0x999f681646d4a755815f9cb19e1acc8565a0c2ac': 'Contract Authority',
  '0x0000000000000000000000000000000000000000': 'Genesis'
};

async function updateLastBlockMiner() {
  try {
    const blockNumberHex = await rpcCall('eth_blockNumber');
    if (blockNumberHex) {
      const block = await rpcCall('eth_getBlockByNumber', [blockNumberHex, false]);
      if (block && block.miner) {
        lastBlockMiner = block.miner;
      }
    }
  } catch (error) {
    // Ignore errors, likely node not fully started or temporary issue
  }
}
// --- PoA Simulation Display End ---

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

// Register a wine batch on the blockchain
async function registerWineBatch(batchName, productionDate, grapeVariety, location, additionalDetails) {
  // Create a data structure for the wine batch
  const wineBatch = {
    batchName,
    productionDate,
    grapeVariety,
    certifications: [],
    location,
    additionalDetails,
    producer: PRODUCER_ACCOUNT,
    status: "Registered",
    timestamp: Math.floor(Date.now() / 1000)
  };
  
  // Serialize the data
  const batchData = JSON.stringify(wineBatch);
  
  // Create a unique identifier for the batch
  const batchId = crypto.createHash('sha256').update(batchData).digest('hex');
  wineBatch.batchId = batchId;
  
  // Prefix to indicate this is a wine batch registration
  const dataPrefix = 'WINE_BATCH_REGISTRATION:';
  
  // Encode the data to hexadecimal for sending in a transaction
  const hexData = '0x' + Buffer.from(dataPrefix + batchData).toString('hex');
  
  console.log(`Registering wine batch "${batchName}" with ID: ${batchId}`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: PRODUCER_ACCOUNT,
      to: PRODUCER_ACCOUNT, // We send to ourselves to store the data
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
    console.log('Wine batch registration confirmed!');
    wineBatch.transactionHash = txHash;
    
    // Store in local database
    wineBatches[batchId] = wineBatch;
    fs.writeFileSync(DB_FILE, JSON.stringify(wineBatches, null, 2));
    
    return { batchId, txHash };
  } else {
    console.log('Registration not confirmed after several attempts');
    throw new Error('Transaction not confirmed');
  }
}

// Send batch to certifier
async function sendBatchToCertifier(batchId, certifierId) {
  // Check if batch exists
  if (!wineBatches[batchId]) {
    throw new Error(`Batch with ID ${batchId} not found`);
  }
  
  // Check if certifier exists
  const certifier = knownCertifiers.find(c => c.id === certifierId);
  if (!certifier) {
    throw new Error(`Certifier with ID ${certifierId} not found`);
  }
  
  // Update batch status
  wineBatches[batchId].status = "Sent to Certifier";
  wineBatches[batchId].certifierId = certifierId;
  wineBatches[batchId].sentToCertifierAt = Math.floor(Date.now() / 1000);
  
  // Save to database
  fs.writeFileSync(DB_FILE, JSON.stringify(wineBatches, null, 2));
  
  // In a real system, we would send this to the certifier via the blockchain
  // For demo purposes, we'll write to a shared folder
  const certifierFolder = path.join(__dirname, '..', 'shared-data', 'certifier', 'incoming');
  
  // Ensure the directory exists
  if (!fs.existsSync(certifierFolder)) {
    fs.mkdirSync(certifierFolder, { recursive: true });
  }
  
  // Create certification request in the format expected by the certifier
  const batch = wineBatches[batchId];
  const certificationRequest = {
    batchId,
    producer: PRODUCER_ACCOUNT,
    producerName: "Wine Producer CLI",
    batchName: batch.batchName,
    grapeVariety: batch.grapeVariety,
    location: batch.location,
    productionDate: batch.productionDate,
    requestTimestamp: Math.floor(Date.now() / 1000),
    status: "Pending"
  };
  
  // Write the file with the correct naming convention (request- instead of batch-)
  fs.writeFileSync(
    path.join(certifierFolder, `request-${batchId}.json`),
    JSON.stringify(certificationRequest, null, 2)
  );
  
  console.log(`Batch ${batchId} sent to certifier ${certifier.name}`);
  return { success: true, message: `Batch sent to certifier ${certifier.name}` };
}

// Check for certification results
function checkCertificationResults() {
  const resultsFolder = path.join(__dirname, '..', 'shared-data', 'producer', 'certifications');
  
  // Ensure the directory exists
  if (!fs.existsSync(resultsFolder)) {
    fs.mkdirSync(resultsFolder, { recursive: true });
    return [];
  }
  
  const results = [];
  
  // Read all certification result files
  const files = fs.readdirSync(resultsFolder);
  
  for (const file of files) {
    if (file.startsWith('certification-') && file.endsWith('.json')) {
      try {
        const result = JSON.parse(fs.readFileSync(path.join(resultsFolder, file), 'utf8'));
        
        // Update local batch data if applicable
        if (result.batchId && wineBatches[result.batchId]) {
          wineBatches[result.batchId].certifications = result.certifications;
          wineBatches[result.batchId].status = result.status;
          wineBatches[result.batchId].certifier = result.certifier;
          wineBatches[result.batchId].certificationTimestamp = result.timestamp;
          
          // Process the certification result
          results.push(result);
          
          // Remove the file after processing
          fs.unlinkSync(path.join(resultsFolder, file));
        }
      } catch (error) {
        console.error(`Error processing certification file ${file}:`, error.message);
      }
    }
  }
  
  // Save updated batch data
  if (results.length > 0) {
    fs.writeFileSync(DB_FILE, JSON.stringify(wineBatches, null, 2));
  }
  
  return results;
}

// Main menu function
async function showMainMenu() {
  // --- PoA Simulation Display Start ---
  await updateLastBlockMiner(); // Update miner info before showing menu
  const minerName = authorityNames[lastBlockMiner] || lastBlockMiner;
  // --- PoA Simulation Display End ---

  console.clear();
  console.log('\n=== WINE PRODUCER CLI ===');
  console.log(`\nBlockchain Node: Connected (Last block by: ${minerName})`); // Display miner info
  console.log('1. Register a new wine batch');
  console.log('2. View my wine batches');
  console.log('3. Send batch to certifier');
  console.log('4. Check for certification results');
  console.log('5. Exit');
  
  rl.question('\nSelect an option: ', async (answer) => {
    switch (answer.trim()) {
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
        await checkCertificationsMenu();
        break;
      case '5':
        cleanupAndExit();
        break;
      default:
        console.log('\nInvalid option. Please try again.');
        setTimeout(showMainMenu, 1500);
    }
  });
}

// Register batch menu
async function registerBatchMenu() {
  console.clear();
  console.log('\n=== REGISTER NEW WINE BATCH ===');
  
  rl.question('Batch Name: ', (batchName) => {
    rl.question('Production Date (YYYY-MM-DD): ', (productionDate) => {
      rl.question('Grape Variety: ', (grapeVariety) => {
        rl.question('Location: ', (location) => {
          rl.question('Additional Details: ', async (additionalDetails) => {
            try {
              console.log('\nRegistering batch on blockchain...');
              const result = await registerWineBatch(
                batchName,
                productionDate,
                grapeVariety,
                location,
                additionalDetails
              );
              
              console.log(`\nBatch registered successfully!`);
              console.log(`Batch ID: ${result.batchId}`);
              console.log(`Transaction Hash: ${result.txHash}`);
              
              rl.question('\nPress Enter to return to main menu...', () => {
                showMainMenu();
              });
            } catch (error) {
              console.error('\nError registering batch:', error.message);
              rl.question('\nPress Enter to return to main menu...', () => {
                showMainMenu();
              });
            }
          });
        });
      });
    });
  });
}

// View batches menu
async function viewBatchesMenu() {
  console.clear();
  console.log('\n=== MY WINE BATCHES ===');
  
  const batches = Object.values(wineBatches);
  
  if (batches.length === 0) {
    console.log('\nNo batches found.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log(`\nTotal Batches: ${batches.length}\n`);
  
  batches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
    console.log(`   Status: ${batch.status}`);
    console.log(`   Grape: ${batch.grapeVariety}`);
    console.log(`   Location: ${batch.location}`);
    if (batch.certifications && batch.certifications.length > 0) {
      console.log(`   Certifications: ${batch.certifications.join(', ')}`);
    }
    console.log('');
  });
  
  rl.question('\nEnter batch number for details (or 0 to return to main menu): ', (answer) => {
    const batchIndex = parseInt(answer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < batches.length) {
      const batch = batches[batchIndex];
      console.clear();
      console.log('\n=== BATCH DETAILS ===');
      console.log(JSON.stringify(batch, null, 2));
      
      rl.question('\nPress Enter to return to batch list...', () => {
        viewBatchesMenu();
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(viewBatchesMenu, 1500);
    }
  });
}

// Send to certifier menu
async function sendToCertifierMenu() {
  console.clear();
  console.log('\n=== SEND BATCH TO CERTIFIER ===');
  
  const batches = Object.values(wineBatches).filter(b => 
    b.status === 'Registered' || 
    (b.status === 'Sent to Certifier' && !b.certifications)
  );
  
  if (batches.length === 0) {
    console.log('\nNo batches available to send to certifier.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nAvailable batches:');
  batches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
  });
  
  rl.question('\nSelect batch number to send (or 0 to return to main menu): ', (batchAnswer) => {
    const batchIndex = parseInt(batchAnswer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < batches.length) {
      console.log('\nAvailable certifiers:');
      knownCertifiers.forEach((certifier, index) => {
        console.log(`${index + 1}. ${certifier.name} (ID: ${certifier.id})`);
      });
      
      rl.question('\nSelect certifier number: ', async (certifierAnswer) => {
        const certifierIndex = parseInt(certifierAnswer.trim()) - 1;
        
        if (certifierIndex >= 0 && certifierIndex < knownCertifiers.length) {
          const batch = batches[batchIndex];
          const certifier = knownCertifiers[certifierIndex];
          
          try {
            console.log(`\nSending batch "${batch.batchName}" to certifier "${certifier.name}"...`);
            const result = await sendBatchToCertifier(batch.batchId, certifier.id);
            
            console.log(`\n${result.message}`);
            rl.question('\nPress Enter to return to main menu...', () => {
              showMainMenu();
            });
          } catch (error) {
            console.error('\nError sending batch to certifier:', error.message);
            rl.question('\nPress Enter to return to main menu...', () => {
              showMainMenu();
            });
          }
        } else {
          console.log('\nInvalid certifier number.');
          setTimeout(sendToCertifierMenu, 1500);
        }
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(sendToCertifierMenu, 1500);
    }
  });
}

// Check certifications menu
async function checkCertificationsMenu() {
  console.clear();
  console.log('\n=== CHECK CERTIFICATION RESULTS ===');
  
  console.log('\nChecking for new certification results...');
  const results = checkCertificationResults();
  
  if (results.length === 0) {
    console.log('\nNo new certification results found.');
  } else {
    console.log(`\nFound ${results.length} new certification results:`);
    
    results.forEach((result, index) => {
      const batch = wineBatches[result.batchId];
      console.log(`\n${index + 1}. ${batch.batchName}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Certifier: ${result.certifier}`);
      console.log(`   Certifications: ${result.certifications.join(', ')}`);
      console.log(`   Timestamp: ${new Date(result.timestamp * 1000).toLocaleString()}`);
    });
  }
  
  rl.question('\nPress Enter to return to main menu...', () => {
    showMainMenu();
  });
}

// Cleanup and exit
function cleanupAndExit() {
  console.log('\nShutting down Wine Producer CLI...');
  
  // Save any pending data
  fs.writeFileSync(DB_FILE, JSON.stringify(wineBatches, null, 2));
  
  // Close readline interface
  rl.close();
  
  // In a real system, we might want to gracefully shutdown the node
  if (nodeProcess) {
    nodeProcess.kill();
  }
  
  console.log('Goodbye!');
  process.exit(0);
}

// Start the application
async function start() {
  console.clear();
  console.log('Starting Wine Producer CLI...');
  const nodeStarted = await startNode();
  
  if (!nodeStarted) {
    console.error('Exiting due to node startup failure.');
    process.exit(1);
  }

  // --- PoA Simulation Display Start ---
  // Periodically update the last block miner info in the background
  setInterval(updateLastBlockMiner, 15000); // Update every 15 seconds
  await updateLastBlockMiner(); // Initial fetch
  // --- PoA Simulation Display End ---

  showMainMenu();
}

start(); 