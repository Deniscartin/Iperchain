#!/usr/bin/env node

/**
 * Wine Certifier CLI
 * 
 * Command line interface for wine certifiers to:
 * - Review pending certification requests
 * - Certify wine batches with quality marks
 * - Record certifications on the blockchain
 * - Send certified batches to retailers
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');

// Configuration
const CERTIFIER_ACCOUNT = '0x123f681646d4a755815f9cb19e1acc8565a0c2ac';
const BLOCKCHAIN_PORT = 8545;
const DB_FILE = path.join(__dirname, 'certifier-batches.json');
const RETAILERS_FILE = path.join(__dirname, 'known-retailers.json');

// Ensure DB files exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    pending: {},
    certified: {}
  }));
}

if (!fs.existsSync(RETAILERS_FILE)) {
  fs.writeFileSync(RETAILERS_FILE, JSON.stringify([
    { id: 'retailer1', name: 'Premium Wine Shop', address: '0x456f681646d4a755815f9cb19e1acc8565a0c2ac' }
  ]));
}

// Load data
let batchesDB = { pending: {}, certified: {} };
try {
  batchesDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  // Ensure proper structure
  if (!batchesDB.pending) batchesDB.pending = {};
  if (!batchesDB.certified) batchesDB.certified = {};
} catch (error) {
  console.error('Error loading batches database:', error.message);
}

let knownRetailers = [];
try {
  knownRetailers = JSON.parse(fs.readFileSync(RETAILERS_FILE, 'utf8'));
} catch (error) {
  console.error('Error loading retailers database:', error.message);
  knownRetailers = [];
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

// Check for certification requests
function checkCertificationRequests() {
  const requestsFolder = path.join(__dirname, '..', 'shared-data', 'certifier', 'incoming');
  
  // Ensure the directory exists
  if (!fs.existsSync(requestsFolder)) {
    fs.mkdirSync(requestsFolder, { recursive: true });
    return [];
  }
  
  const newRequests = [];
  
  // Read all request files
  const files = fs.readdirSync(requestsFolder);
  
  for (const file of files) {
    if (file.startsWith('request-') && file.endsWith('.json')) {
      try {
        const request = JSON.parse(fs.readFileSync(path.join(requestsFolder, file), 'utf8'));
        
        // Add to pending batches if not already there
        if (request.batchId && !batchesDB.pending[request.batchId]) {
          batchesDB.pending[request.batchId] = {
            ...request,
            receivedAt: Math.floor(Date.now() / 1000)
          };
          
          newRequests.push(request);
          
          // Remove the file after processing
          fs.unlinkSync(path.join(requestsFolder, file));
        }
      } catch (error) {
        console.error(`Error processing request file ${file}:`, error.message);
      }
    }
  }
  
  // Save updated batch data
  if (newRequests.length > 0) {
    fs.writeFileSync(DB_FILE, JSON.stringify(batchesDB, null, 2));
  }
  
  return newRequests;
}

// Certify a wine batch on the blockchain
async function certifyWineBatch(batchId, certifications, notes) {
  if (!batchesDB.pending[batchId]) {
    throw new Error('Batch not found in pending requests');
  }
  
  const batch = batchesDB.pending[batchId];
  
  // Create a certification data structure
  const certificationData = {
    batchId,
    certifications,
    certifier: CERTIFIER_ACCOUNT,
    certifierName: "Premium Wine Certifications",
    notes,
    timestamp: Math.floor(Date.now() / 1000),
    originalProducer: batch.producer,
    batchName: batch.batchName
  };
  
  // Serialize the data
  const dataString = JSON.stringify(certificationData);
  
  // Prefix to indicate this is a wine certification
  const dataPrefix = 'WINE_BATCH_CERTIFICATION:';
  
  // Encode the data to hexadecimal for sending in a transaction
  const hexData = '0x' + Buffer.from(dataPrefix + dataString).toString('hex');
  
  console.log(`Certifying wine batch "${batch.batchName}" with ID: ${batchId}`);
  console.log(`Certifications: ${certifications.join(', ')}`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: CERTIFIER_ACCOUNT,
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
    console.log('Certification confirmed on blockchain!');
    
    // Move from pending to certified
    const certifiedBatch = {
      ...batch,
      certifications,
      notes,
      certifiedAt: Math.floor(Date.now() / 1000),
      transactionHash: txHash,
      status: "Certified"
    };
    
    // Update databases
    delete batchesDB.pending[batchId];
    batchesDB.certified[batchId] = certifiedBatch;
    fs.writeFileSync(DB_FILE, JSON.stringify(batchesDB, null, 2));
    
    // Send certification result to producer
    sendCertificationResultToProducer(certifiedBatch);
    
    return { batchId, txHash };
  } else {
    console.log('Certification not confirmed after several attempts');
    throw new Error('Transaction not confirmed');
  }
}

// Send certification result to producer
function sendCertificationResultToProducer(certifiedBatch) {
  const producerFolder = path.join(__dirname, '..', 'shared-data', 'producer', 'certifications');
  
  // Ensure the directory exists
  if (!fs.existsSync(producerFolder)) {
    fs.mkdirSync(producerFolder, { recursive: true });
  }
  
  const certificationResult = {
    batchId: certifiedBatch.batchId,
    status: certifiedBatch.status,
    certifications: certifiedBatch.certifications,
    certifier: "Premium Wine Certifications",
    timestamp: Math.floor(Date.now() / 1000),
    notes: certifiedBatch.notes || ""
  };
  
  const resultFile = path.join(producerFolder, `certification-${certifiedBatch.batchId}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(certificationResult, null, 2));
  
  console.log(`Certification result sent to producer for batch ${certifiedBatch.batchId}`);
}

// Send certified batch to retailer
function sendBatchToRetailer(batchId, retailerId) {
  if (!batchesDB.certified[batchId]) {
    throw new Error('Batch not found in certified batches');
  }
  
  const retailer = knownRetailers.find(r => r.id === retailerId);
  if (!retailer) {
    throw new Error('Retailer not found');
  }
  
  const batch = batchesDB.certified[batchId];
  
  // Create shipping notification
  const shippingData = {
    batchId,
    batchName: batch.batchName,
    producer: batch.producer,
    producerName: batch.producerName,
    certifier: CERTIFIER_ACCOUNT,
    certifierName: "Premium Wine Certifications",
    certifications: batch.certifications,
    retailer: retailer.address,
    retailerName: retailer.name,
    shippingTimestamp: Math.floor(Date.now() / 1000),
    status: "Shipped"
  };
  
  // Write to shared file for retailer to pick up
  const retailerFolder = path.join(__dirname, '..', 'shared-data', 'retailer', 'incoming');
  
  // Ensure the directory exists
  if (!fs.existsSync(retailerFolder)) {
    fs.mkdirSync(retailerFolder, { recursive: true });
  }
  
  const shippingFile = path.join(retailerFolder, `shipping-${batchId}.json`);
  fs.writeFileSync(shippingFile, JSON.stringify(shippingData, null, 2));
  
  // Update local status
  batch.status = "Shipped to Retailer";
  batch.sentToRetailer = {
    retailerId,
    retailerName: retailer.name,
    retailerAddress: retailer.address,
    timestamp: Math.floor(Date.now() / 1000)
  };
  
  // Save updated batch
  fs.writeFileSync(DB_FILE, JSON.stringify(batchesDB, null, 2));
  
  console.log(`Batch ${batchId} sent to retailer ${retailer.name}`);
  return { success: true, message: `Batch sent to retailer ${retailer.name}` };
}

// Main menu function
function showMainMenu() {
  console.clear();
  console.log('\n=== WINE CERTIFIER CLI ===');
  console.log('1. Check for new certification requests');
  console.log('2. View pending certification requests');
  console.log('3. View certified batches');
  console.log('4. Certify a wine batch');
  console.log('5. Send certified batch to retailer');
  console.log('6. Exit');
  
  rl.question('\nSelect an option: ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        await checkRequestsMenu();
        break;
      case '2':
        await viewPendingMenu();
        break;
      case '3':
        await viewCertifiedMenu();
        break;
      case '4':
        await certifyBatchMenu();
        break;
      case '5':
        await sendToRetailerMenu();
        break;
      case '6':
        cleanupAndExit();
        break;
      default:
        console.log('\nInvalid option. Please try again.');
        setTimeout(showMainMenu, 1500);
    }
  });
}

// Check requests menu
async function checkRequestsMenu() {
  console.clear();
  console.log('\n=== CHECK NEW CERTIFICATION REQUESTS ===');
  
  console.log('\nChecking for new certification requests...');
  const newRequests = checkCertificationRequests();
  
  if (newRequests.length === 0) {
    console.log('\nNo new certification requests found.');
  } else {
    console.log(`\nFound ${newRequests.length} new certification requests:`);
    
    newRequests.forEach((request, index) => {
      console.log(`\n${index + 1}. ${request.batchName}`);
      console.log(`   Producer: ${request.producerName}`);
      console.log(`   Grape Variety: ${request.grapeVariety}`);
      console.log(`   Location: ${request.location}`);
      console.log(`   Production Date: ${request.productionDate}`);
    });
  }
  
  rl.question('\nPress Enter to return to main menu...', () => {
    showMainMenu();
  });
}

// View pending menu
async function viewPendingMenu() {
  console.clear();
  console.log('\n=== PENDING CERTIFICATION REQUESTS ===');
  
  const pendingBatches = Object.values(batchesDB.pending);
  
  if (pendingBatches.length === 0) {
    console.log('\nNo pending certification requests.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log(`\nTotal Pending Requests: ${pendingBatches.length}\n`);
  
  pendingBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
    console.log(`   Producer: ${batch.producerName}`);
    console.log(`   Grape Variety: ${batch.grapeVariety}`);
    console.log(`   Location: ${batch.location}`);
    console.log(`   Received: ${new Date(batch.receivedAt * 1000).toLocaleString()}`);
    console.log('');
  });
  
  rl.question('\nEnter batch number for details (or 0 to return to main menu): ', (answer) => {
    const batchIndex = parseInt(answer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < pendingBatches.length) {
      const batch = pendingBatches[batchIndex];
      console.clear();
      console.log('\n=== BATCH DETAILS ===');
      console.log(JSON.stringify(batch, null, 2));
      
      rl.question('\nPress Enter to return to pending list...', () => {
        viewPendingMenu();
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(viewPendingMenu, 1500);
    }
  });
}

// View certified menu
async function viewCertifiedMenu() {
  console.clear();
  console.log('\n=== CERTIFIED BATCHES ===');
  
  const certifiedBatches = Object.values(batchesDB.certified);
  
  if (certifiedBatches.length === 0) {
    console.log('\nNo certified batches.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log(`\nTotal Certified Batches: ${certifiedBatches.length}\n`);
  
  certifiedBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
    console.log(`   Status: ${batch.status}`);
    console.log(`   Producer: ${batch.producerName}`);
    console.log(`   Certifications: ${batch.certifications.join(', ')}`);
    console.log(`   Certified: ${new Date(batch.certifiedAt * 1000).toLocaleString()}`);
    console.log('');
  });
  
  rl.question('\nEnter batch number for details (or 0 to return to main menu): ', (answer) => {
    const batchIndex = parseInt(answer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < certifiedBatches.length) {
      const batch = certifiedBatches[batchIndex];
      console.clear();
      console.log('\n=== BATCH DETAILS ===');
      console.log(JSON.stringify(batch, null, 2));
      
      rl.question('\nPress Enter to return to certified list...', () => {
        viewCertifiedMenu();
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(viewCertifiedMenu, 1500);
    }
  });
}

// Certify batch menu
async function certifyBatchMenu() {
  console.clear();
  console.log('\n=== CERTIFY WINE BATCH ===');
  
  const pendingBatches = Object.values(batchesDB.pending);
  
  if (pendingBatches.length === 0) {
    console.log('\nNo pending batches to certify.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nPending batches:');
  pendingBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
  });
  
  rl.question('\nSelect batch number to certify (or 0 to return to main menu): ', (batchAnswer) => {
    const batchIndex = parseInt(batchAnswer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < pendingBatches.length) {
      const batch = pendingBatches[batchIndex];
      console.log(`\nCertifying batch: ${batch.batchName}`);
      
      console.log('\nAvailable certifications:');
      console.log('1. Organic');
      console.log('2. Premium Quality');
      console.log('3. Sustainable');
      console.log('4. Denomination of Origin');
      console.log('5. Vegan Friendly');
      
      rl.question('\nEnter certification numbers (comma-separated, e.g., 1,3,4): ', (certAnswers) => {
        const certOptions = ['Organic', 'Premium Quality', 'Sustainable', 'Denomination of Origin', 'Vegan Friendly'];
        const selectedCerts = certAnswers.split(',')
          .map(num => parseInt(num.trim()) - 1)
          .filter(num => num >= 0 && num < certOptions.length)
          .map(num => certOptions[num]);
        
        if (selectedCerts.length === 0) {
          console.log('\nNo valid certifications selected.');
          rl.question('\nPress Enter to try again...', () => {
            certifyBatchMenu();
          });
          return;
        }
        
        rl.question('\nCertification notes: ', async (notes) => {
          try {
            console.log('\nRecording certification on blockchain...');
            const result = await certifyWineBatch(
              batch.batchId,
              selectedCerts,
              notes
            );
            
            console.log(`\nBatch certified successfully!`);
            console.log(`Batch ID: ${result.batchId}`);
            console.log(`Transaction Hash: ${result.txHash}`);
            
            rl.question('\nPress Enter to return to main menu...', () => {
              showMainMenu();
            });
          } catch (error) {
            console.error('\nError certifying batch:', error.message);
            rl.question('\nPress Enter to return to main menu...', () => {
              showMainMenu();
            });
          }
        });
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(certifyBatchMenu, 1500);
    }
  });
}

// Send to retailer menu
async function sendToRetailerMenu() {
  console.clear();
  console.log('\n=== SEND BATCH TO RETAILER ===');
  
  const certifiedBatches = Object.values(batchesDB.certified).filter(b => 
    b.status === 'Certified' || 
    (b.status === 'Shipped to Retailer' && !b.receivedByRetailer)
  );
  
  if (certifiedBatches.length === 0) {
    console.log('\nNo certified batches available to send to retailer.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nAvailable batches:');
  certifiedBatches.forEach((batch, index) => {
    console.log(`${index + 1}. ${batch.batchName} (ID: ${batch.batchId.substring(0, 8)}...)`);
  });
  
  rl.question('\nSelect batch number to send (or 0 to return to main menu): ', (batchAnswer) => {
    const batchIndex = parseInt(batchAnswer.trim()) - 1;
    
    if (batchIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (batchIndex >= 0 && batchIndex < certifiedBatches.length) {
      console.log('\nAvailable retailers:');
      knownRetailers.forEach((retailer, index) => {
        console.log(`${index + 1}. ${retailer.name} (ID: ${retailer.id})`);
      });
      
      rl.question('\nSelect retailer number: ', async (retailerAnswer) => {
        const retailerIndex = parseInt(retailerAnswer.trim()) - 1;
        
        if (retailerIndex >= 0 && retailerIndex < knownRetailers.length) {
          const batch = certifiedBatches[batchIndex];
          const retailer = knownRetailers[retailerIndex];
          
          try {
            console.log(`\nSending batch "${batch.batchName}" to retailer "${retailer.name}"...`);
            const result = sendBatchToRetailer(batch.batchId, retailer.id);
            
            console.log(`\n${result.message}`);
            rl.question('\nPress Enter to return to main menu...', () => {
              showMainMenu();
            });
          } catch (error) {
            console.error('\nError sending batch to retailer:', error.message);
            rl.question('\nPress Enter to return to main menu...', () => {
              showMainMenu();
            });
          }
        } else {
          console.log('\nInvalid retailer number.');
          setTimeout(sendToRetailerMenu, 1500);
        }
      });
    } else {
      console.log('\nInvalid batch number.');
      setTimeout(sendToRetailerMenu, 1500);
    }
  });
}

// Cleanup and exit
function cleanupAndExit() {
  console.log('\nSaving data and exiting...');
  
  // Save batches to database file
  fs.writeFileSync(DB_FILE, JSON.stringify(batchesDB, null, 2));
  
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
  console.log('\nWine Certifier CLI Starting...');
  
  // Create shared data directories
  const sharedDirs = [
    path.join(__dirname, 'shared-data', 'producer', 'certifications'),
    path.join(__dirname, 'shared-data', 'certifier', 'incoming'),
    path.join(__dirname, 'shared-data', 'retailer', 'incoming')
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