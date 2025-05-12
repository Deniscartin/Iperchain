#!/usr/bin/env node

/**
 * Wine Smart Contract CLI
 * 
 * Command line interface for creating and managing smart contracts for wine traceability:
 * - Create new smart contracts with custom fields
 * - Deploy contracts to the blockchain
 * - List available contracts
 * - Update existing contracts
 * - Generate contract interfaces for other CLI tools
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');

// Configuration
const CONTRACT_CREATOR_ACCOUNT = '0x999f681646d4a755815f9cb19e1acc8565a0c2ac';
const BLOCKCHAIN_PORT = 8545;
const CONTRACTS_DB_FILE = path.join(__dirname, 'contracts-db.json');
const SHARED_CONTRACTS_FOLDER = path.join(__dirname, 'shared-data', 'contracts');

// Ensure DB files and folders exist
if (!fs.existsSync(CONTRACTS_DB_FILE)) {
  fs.writeFileSync(CONTRACTS_DB_FILE, JSON.stringify({
    contracts: {}
  }));
}

if (!fs.existsSync(SHARED_CONTRACTS_FOLDER)) {
  fs.mkdirSync(SHARED_CONTRACTS_FOLDER, { recursive: true });
}

// Load contracts database
let contractsDB = { contracts: {} };
try {
  contractsDB = JSON.parse(fs.readFileSync(CONTRACTS_DB_FILE, 'utf8'));
} catch (error) {
  console.error('Error loading contracts database:', error.message);
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

// Create and deploy a new smart contract
async function createSmartContract(contractName, description, fields) {
  if (contractsDB.contracts[contractName]) {
    throw new Error(`Contract with name "${contractName}" already exists`);
  }
  
  // Create contract structure
  const contractId = crypto.createHash('sha256').update(`${contractName}-${Date.now()}`).digest('hex');
  const contract = {
    id: contractId,
    name: contractName,
    description,
    fields,
    createdAt: Math.floor(Date.now() / 1000),
    creator: CONTRACT_CREATOR_ACCOUNT,
    status: 'Pending',
    instances: []
  };
  
  // Create contract bytecode (in a real system, this would compile Solidity to bytecode)
  const contractData = JSON.stringify(contract);
  const contractPrefix = 'WINE_CONTRACT_DEPLOYMENT:';
  const hexData = '0x' + Buffer.from(contractPrefix + contractData).toString('hex');
  
  console.log(`Deploying contract "${contractName}" to blockchain...`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: CONTRACT_CREATOR_ACCOUNT,
      to: null, // Contract creation
      value: '0x0',
      data: hexData,
      gas: '0x200000'
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
  
  if (receipt && receipt.contractAddress) {
    console.log(`Contract deployed successfully at address: ${receipt.contractAddress}`);
    
    // Update contract with blockchain info
    contract.status = 'Deployed';
    contract.address = receipt.contractAddress;
    contract.transactionHash = txHash;
    
    // Save to database
    contractsDB.contracts[contractName] = contract;
    fs.writeFileSync(CONTRACTS_DB_FILE, JSON.stringify(contractsDB, null, 2));
    
    // Create interface file for other CLIs
    createContractInterface(contract);
    
    return contract;
  } else {
    console.log('Contract deployment not confirmed after several attempts');
    throw new Error('Contract deployment failed');
  }
}

// Create interface file for other CLIs to use
function createContractInterface(contract) {
  const interfaceFile = path.join(SHARED_CONTRACTS_FOLDER, `${contract.name}.json`);
  
  const interfaceData = {
    id: contract.id,
    name: contract.name,
    description: contract.description,
    address: contract.address,
    fields: contract.fields,
    abi: generateContractABI(contract)
  };
  
  fs.writeFileSync(interfaceFile, JSON.stringify(interfaceData, null, 2));
  console.log(`Contract interface file created at: ${interfaceFile}`);
}

// Generate a simple ABI for the contract
function generateContractABI(contract) {
  const abi = [];
  
  // Constructor
  abi.push({
    type: 'constructor',
    inputs: contract.fields.map(field => ({
      name: field.name,
      type: mapFieldTypeToABIType(field.type)
    }))
  });
  
  // Add getter functions for each field
  contract.fields.forEach(field => {
    abi.push({
      name: `get${capitalizeFirstLetter(field.name)}`,
      type: 'function',
      inputs: [],
      outputs: [{ name: '', type: mapFieldTypeToABIType(field.type) }],
      stateMutability: 'view'
    });
  });
  
  // Add setter functions for each field
  contract.fields.forEach(field => {
    abi.push({
      name: `set${capitalizeFirstLetter(field.name)}`,
      type: 'function',
      inputs: [{ name: 'value', type: mapFieldTypeToABIType(field.type) }],
      outputs: [],
      stateMutability: 'nonpayable'
    });
  });
  
  return abi;
}

// Helper to map our field types to Solidity/ABI types
function mapFieldTypeToABIType(fieldType) {
  switch (fieldType.toLowerCase()) {
    case 'text':
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'uint256';
    case 'boolean':
    case 'bool':
      return 'bool';
    case 'address':
      return 'address';
    case 'date':
      return 'uint256'; // Unix timestamp
    default:
      return 'string';
  }
}

// Helper to capitalize the first letter of a string
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Create a new instance of a contract
async function createContractInstance(contractName, fieldValues) {
  const contract = contractsDB.contracts[contractName];
  
  if (!contract) {
    throw new Error(`Contract "${contractName}" not found`);
  }
  
  if (contract.status !== 'Deployed') {
    throw new Error(`Contract "${contractName}" is not deployed`);
  }
  
  // Validate field values
  contract.fields.forEach(field => {
    if (field.required && !fieldValues[field.name]) {
      throw new Error(`Required field "${field.name}" is missing`);
    }
  });
  
  // Create instance data
  const instanceId = crypto.createHash('sha256').update(`${contractName}-instance-${Date.now()}`).digest('hex');
  const instance = {
    id: instanceId,
    contractId: contract.id,
    contractName: contract.name,
    fieldValues,
    createdAt: Math.floor(Date.now() / 1000),
    creator: CONTRACT_CREATOR_ACCOUNT,
    status: 'Pending'
  };
  
  // Create transaction data
  const instanceData = JSON.stringify(instance);
  const instancePrefix = 'WINE_CONTRACT_INSTANCE:';
  const hexData = '0x' + Buffer.from(instancePrefix + instanceData).toString('hex');
  
  console.log(`Creating instance of contract "${contractName}"...`);
  
  // Send the transaction
  const txHash = await rpcCall('eth_sendTransaction', [
    {
      from: CONTRACT_CREATOR_ACCOUNT,
      to: contract.address,
      value: '0x0',
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
    console.log(`Contract instance created successfully!`);
    
    // Update instance with blockchain info
    instance.status = 'Active';
    instance.transactionHash = txHash;
    
    // Save to database
    contract.instances.push(instance);
    fs.writeFileSync(CONTRACTS_DB_FILE, JSON.stringify(contractsDB, null, 2));
    
    return instance;
  } else {
    console.log('Contract instance creation not confirmed after several attempts');
    throw new Error('Contract instance creation failed');
  }
}

// Main menu function
function showMainMenu() {
  console.clear();
  console.log('\n=== WINE SMART CONTRACT CLI ===');
  console.log('1. Create a new smart contract');
  console.log('2. View available contracts');
  console.log('3. Create a contract instance');
  console.log('4. Update existing contract');
  console.log('5. Test contract interaction');
  console.log('6. Exit');
  
  rl.question('\nSelect an option: ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        await createContractMenu();
        break;
      case '2':
        await viewContractsMenu();
        break;
      case '3':
        await createInstanceMenu();
        break;
      case '4':
        await updateContractMenu();
        break;
      case '5':
        await testContractMenu();
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

// Create contract menu
async function createContractMenu() {
  console.clear();
  console.log('\n=== CREATE NEW SMART CONTRACT ===');
  
  rl.question('Contract Name: ', (contractName) => {
    if (!contractName) {
      console.log('\nContract name is required');
      setTimeout(createContractMenu, 1500);
      return;
    }
    
    rl.question('Description: ', (description) => {
      console.log('\nContract Fields:');
      console.log('Contract fields define the structure of data stored in the contract.');
      console.log('For each field, you will specify a name, type, and whether it is required.');
      console.log('Available types: text, number, boolean, address, date');
      
      const fields = [];
      function addField() {
        rl.question('\nField Name (or "done" to finish): ', (fieldName) => {
          if (fieldName.toLowerCase() === 'done') {
            if (fields.length === 0) {
              console.log('\nAt least one field is required');
              addField();
              return;
            }
            
            deployContract(contractName, description, fields);
            return;
          }
          
          rl.question('Field Type (text, number, boolean, address, date): ', (fieldType) => {
            const validTypes = ['text', 'number', 'boolean', 'address', 'date'];
            if (!validTypes.includes(fieldType.toLowerCase())) {
              console.log('\nInvalid field type. Please use one of: text, number, boolean, address, date');
              addField();
              return;
            }
            
            rl.question('Is this field required? (y/n): ', (isRequired) => {
              fields.push({
                name: fieldName,
                type: fieldType.toLowerCase(),
                required: isRequired.toLowerCase() === 'y'
              });
              
              console.log(`\nAdded field: ${fieldName} (${fieldType})`);
              addField();
            });
          });
        });
      }
      
      addField();
    });
  });
  
  // Helper to deploy the contract after collecting fields
  async function deployContract(contractName, description, fields) {
    try {
      console.log('\nDeploying smart contract to blockchain...');
      const contract = await createSmartContract(contractName, description, fields);
      
      console.log(`\nSmart contract "${contractName}" created successfully!`);
      console.log(`Contract ID: ${contract.id}`);
      console.log(`Contract Address: ${contract.address}`);
      
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    } catch (error) {
      console.error('\nError creating contract:', error.message);
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    }
  }
}

// View contracts menu
async function viewContractsMenu() {
  console.clear();
  console.log('\n=== AVAILABLE SMART CONTRACTS ===');
  
  const contracts = Object.values(contractsDB.contracts);
  
  if (contracts.length === 0) {
    console.log('\nNo contracts found.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log(`\nTotal Contracts: ${contracts.length}\n`);
  
  contracts.forEach((contract, index) => {
    console.log(`${index + 1}. ${contract.name}`);
    console.log(`   Status: ${contract.status}`);
    console.log(`   Fields: ${contract.fields.length}`);
    console.log(`   Instances: ${contract.instances.length}`);
    console.log('');
  });
  
  rl.question('\nEnter contract number for details (or 0 to return to main menu): ', (answer) => {
    const contractIndex = parseInt(answer.trim()) - 1;
    
    if (contractIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (contractIndex >= 0 && contractIndex < contracts.length) {
      const contract = contracts[contractIndex];
      console.clear();
      console.log('\n=== CONTRACT DETAILS ===');
      console.log(`Name: ${contract.name}`);
      console.log(`Description: ${contract.description}`);
      console.log(`Status: ${contract.status}`);
      console.log(`Address: ${contract.address}`);
      console.log(`Created: ${new Date(contract.createdAt * 1000).toLocaleString()}`);
      
      console.log('\nFields:');
      contract.fields.forEach((field, i) => {
        console.log(`${i + 1}. ${field.name} (${field.type})${field.required ? ' [Required]' : ''}`);
      });
      
      if (contract.instances.length > 0) {
        console.log('\nInstances:');
        contract.instances.forEach((instance, i) => {
          console.log(`${i + 1}. Instance ${instance.id.substring(0, 8)}...`);
          console.log(`   Created: ${new Date(instance.createdAt * 1000).toLocaleString()}`);
          console.log(`   Status: ${instance.status}`);
        });
      }
      
      rl.question('\nPress Enter to return to contract list...', () => {
        viewContractsMenu();
      });
    } else {
      console.log('\nInvalid contract number.');
      setTimeout(viewContractsMenu, 1500);
    }
  });
}

// Create instance menu
async function createInstanceMenu() {
  console.clear();
  console.log('\n=== CREATE CONTRACT INSTANCE ===');
  
  const contracts = Object.values(contractsDB.contracts).filter(c => c.status === 'Deployed');
  
  if (contracts.length === 0) {
    console.log('\nNo deployed contracts available.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nAvailable contracts:');
  contracts.forEach((contract, index) => {
    console.log(`${index + 1}. ${contract.name}`);
  });
  
  rl.question('\nSelect contract number (or 0 to return to main menu): ', (answer) => {
    const contractIndex = parseInt(answer.trim()) - 1;
    
    if (contractIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (contractIndex >= 0 && contractIndex < contracts.length) {
      const contract = contracts[contractIndex];
      console.log(`\nCreating instance of "${contract.name}"`);
      
      const fieldValues = {};
      
      function collectFieldValues(fieldIndex) {
        if (fieldIndex >= contract.fields.length) {
          // All fields collected, create the instance
          createInstance(contract.name, fieldValues);
          return;
        }
        
        const field = contract.fields[fieldIndex];
        const requiredText = field.required ? ' (Required)' : '';
        
        rl.question(`\nValue for ${field.name} (${field.type})${requiredText}: `, (value) => {
          if (field.required && !value) {
            console.log(`\nField ${field.name} is required.`);
            collectFieldValues(fieldIndex);
            return;
          }
          
          fieldValues[field.name] = value;
          collectFieldValues(fieldIndex + 1);
        });
      }
      
      collectFieldValues(0);
    } else {
      console.log('\nInvalid contract number.');
      setTimeout(createInstanceMenu, 1500);
    }
  });
  
  // Helper to create the instance after collecting field values
  async function createInstance(contractName, fieldValues) {
    try {
      console.log('\nCreating contract instance...');
      const instance = await createContractInstance(contractName, fieldValues);
      
      console.log(`\nContract instance created successfully!`);
      console.log(`Instance ID: ${instance.id}`);
      
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    } catch (error) {
      console.error('\nError creating instance:', error.message);
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    }
  }
}

// Update contract menu
async function updateContractMenu() {
  console.clear();
  console.log('\n=== UPDATE EXISTING CONTRACT ===');
  
  const contracts = Object.values(contractsDB.contracts);
  
  if (contracts.length === 0) {
    console.log('\nNo contracts found.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nAvailable contracts:');
  contracts.forEach((contract, index) => {
    console.log(`${index + 1}. ${contract.name}`);
  });
  
  rl.question('\nSelect contract number to update (or 0 to return to main menu): ', (answer) => {
    const contractIndex = parseInt(answer.trim()) - 1;
    
    if (contractIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (contractIndex >= 0 && contractIndex < contracts.length) {
      const contract = contracts[contractIndex];
      
      console.clear();
      console.log(`\n=== UPDATING CONTRACT: ${contract.name} ===`);
      console.log('\nWhat would you like to update?');
      console.log('1. Add a new field');
      console.log('2. Remove a field');
      console.log('3. Update description');
      console.log('4. Return to main menu');
      
      rl.question('\nSelect an option: ', (updateOption) => {
        switch (updateOption.trim()) {
          case '1':
            addContractField(contract);
            break;
          case '2':
            removeContractField(contract);
            break;
          case '3':
            updateContractDescription(contract);
            break;
          case '4':
          default:
            showMainMenu();
            break;
        }
      });
    } else {
      console.log('\nInvalid contract number.');
      setTimeout(updateContractMenu, 1500);
    }
  });
}

// Add field to contract
function addContractField(contract) {
  console.log('\n=== ADD FIELD TO CONTRACT ===');
  
  rl.question('Field Name: ', (fieldName) => {
    if (!fieldName) {
      console.log('\nField name is required');
      setTimeout(() => addContractField(contract), 1500);
      return;
    }
    
    // Check if field already exists
    if (contract.fields.some(f => f.name === fieldName)) {
      console.log(`\nField "${fieldName}" already exists`);
      setTimeout(() => addContractField(contract), 1500);
      return;
    }
    
    rl.question('Field Type (text, number, boolean, address, date): ', (fieldType) => {
      const validTypes = ['text', 'number', 'boolean', 'address', 'date'];
      if (!validTypes.includes(fieldType.toLowerCase())) {
        console.log('\nInvalid field type. Please use one of: text, number, boolean, address, date');
        setTimeout(() => addContractField(contract), 1500);
        return;
      }
      
      rl.question('Is this field required? (y/n): ', async (isRequired) => {
        const newField = {
          name: fieldName,
          type: fieldType.toLowerCase(),
          required: isRequired.toLowerCase() === 'y'
        };
        
        try {
          // Add field to contract
          contract.fields.push(newField);
          
          // Update contract in database
          contractsDB.contracts[contract.name] = contract;
          fs.writeFileSync(CONTRACTS_DB_FILE, JSON.stringify(contractsDB, null, 2));
          
          // Update interface file
          createContractInterface(contract);
          
          console.log(`\nField "${fieldName}" added to contract "${contract.name}"`);
          rl.question('\nPress Enter to return to main menu...', () => {
            showMainMenu();
          });
        } catch (error) {
          console.error('\nError adding field:', error.message);
          rl.question('\nPress Enter to return to main menu...', () => {
            showMainMenu();
          });
        }
      });
    });
  });
}

// Remove field from contract
function removeContractField(contract) {
  console.log('\n=== REMOVE FIELD FROM CONTRACT ===');
  
  if (contract.fields.length === 0) {
    console.log('\nThis contract has no fields to remove.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nAvailable fields:');
  contract.fields.forEach((field, index) => {
    console.log(`${index + 1}. ${field.name} (${field.type})${field.required ? ' [Required]' : ''}`);
  });
  
  rl.question('\nSelect field number to remove (or 0 to cancel): ', async (answer) => {
    const fieldIndex = parseInt(answer.trim()) - 1;
    
    if (fieldIndex === -1) {
      updateContractMenu();
      return;
    }
    
    if (fieldIndex >= 0 && fieldIndex < contract.fields.length) {
      const fieldToRemove = contract.fields[fieldIndex];
      
      rl.question(`\nAre you sure you want to remove field "${fieldToRemove.name}"? (y/n): `, async (confirm) => {
        if (confirm.toLowerCase() !== 'y') {
          removeContractField(contract);
          return;
        }
        
        try {
          // Check if any instances depend on this field
          const hasInstances = contract.instances.some(instance => 
            instance.fieldValues[fieldToRemove.name] !== undefined
          );
          
          if (hasInstances) {
            console.log(`\nCannot remove field "${fieldToRemove.name}" because existing instances depend on it.`);
            rl.question('\nPress Enter to return to main menu...', () => {
              showMainMenu();
            });
            return;
          }
          
          // Remove field from contract
          contract.fields.splice(fieldIndex, 1);
          
          // Update contract in database
          contractsDB.contracts[contract.name] = contract;
          fs.writeFileSync(CONTRACTS_DB_FILE, JSON.stringify(contractsDB, null, 2));
          
          // Update interface file
          createContractInterface(contract);
          
          console.log(`\nField "${fieldToRemove.name}" removed from contract "${contract.name}"`);
          rl.question('\nPress Enter to return to main menu...', () => {
            showMainMenu();
          });
        } catch (error) {
          console.error('\nError removing field:', error.message);
          rl.question('\nPress Enter to return to main menu...', () => {
            showMainMenu();
          });
        }
      });
    } else {
      console.log('\nInvalid field number.');
      setTimeout(() => removeContractField(contract), 1500);
    }
  });
}

// Update contract description
function updateContractDescription(contract) {
  console.log('\n=== UPDATE CONTRACT DESCRIPTION ===');
  console.log(`\nCurrent description: ${contract.description}`);
  
  rl.question('\nNew description: ', async (newDescription) => {
    try {
      // Update description
      contract.description = newDescription;
      
      // Update contract in database
      contractsDB.contracts[contract.name] = contract;
      fs.writeFileSync(CONTRACTS_DB_FILE, JSON.stringify(contractsDB, null, 2));
      
      // Update interface file
      createContractInterface(contract);
      
      console.log(`\nDescription updated for contract "${contract.name}"`);
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    } catch (error) {
      console.error('\nError updating description:', error.message);
      rl.question('\nPress Enter to return to main menu...', () => {
        showMainMenu();
      });
    }
  });
}

// Test contract interaction menu
async function testContractMenu() {
  console.clear();
  console.log('\n=== TEST CONTRACT INTERACTION ===');
  
  const contracts = Object.values(contractsDB.contracts);
  
  if (contracts.length === 0) {
    console.log('\nNo contracts found.');
    rl.question('\nPress Enter to return to main menu...', () => {
      showMainMenu();
    });
    return;
  }
  
  console.log('\nAvailable contracts:');
  contracts.forEach((contract, index) => {
    console.log(`${index + 1}. ${contract.name}`);
  });
  
  rl.question('\nSelect contract number to test (or 0 to return to main menu): ', (answer) => {
    const contractIndex = parseInt(answer.trim()) - 1;
    
    if (contractIndex === -1) {
      showMainMenu();
      return;
    }
    
    if (contractIndex >= 0 && contractIndex < contracts.length) {
      const contract = contracts[contractIndex];
      
      if (contract.instances.length === 0) {
        console.log(`\nContract "${contract.name}" has no instances to test.`);
        rl.question('\nWould you like to create an instance? (y/n): ', (createNew) => {
          if (createNew.toLowerCase() === 'y') {
            createInstanceMenu();
          } else {
            showMainMenu();
          }
        });
        return;
      }
      
      console.log(`\nInstances of "${contract.name}":`);
      contract.instances.forEach((instance, index) => {
        console.log(`${index + 1}. Instance ${instance.id.substring(0, 8)}...`);
      });
      
      rl.question('\nSelect instance number to test (or 0 to return to main menu): ', (instanceAnswer) => {
        const instanceIndex = parseInt(instanceAnswer.trim()) - 1;
        
        if (instanceIndex === -1) {
          showMainMenu();
          return;
        }
        
        if (instanceIndex >= 0 && instanceIndex < contract.instances.length) {
          const instance = contract.instances[instanceIndex];
          
          console.clear();
          console.log(`\n=== CONTRACT INSTANCE DATA ===`);
          console.log(`Contract: ${contract.name}`);
          console.log(`Instance ID: ${instance.id}`);
          console.log(`Created: ${new Date(instance.createdAt * 1000).toLocaleString()}`);
          console.log(`Status: ${instance.status}`);
          console.log('\nField Values:');
          
          Object.entries(instance.fieldValues).forEach(([fieldName, value]) => {
            const field = contract.fields.find(f => f.name === fieldName);
            console.log(`${fieldName}: ${value} (${field ? field.type : 'unknown'})`);
          });
          
          rl.question('\nPress Enter to return to main menu...', () => {
            showMainMenu();
          });
        } else {
          console.log('\nInvalid instance number.');
          setTimeout(testContractMenu, 1500);
        }
      });
    } else {
      console.log('\nInvalid contract number.');
      setTimeout(testContractMenu, 1500);
    }
  });
}

// Cleanup and exit
function cleanupAndExit() {
  console.log('\nSaving data and exiting...');
  
  // Save contracts database
  fs.writeFileSync(CONTRACTS_DB_FILE, JSON.stringify(contractsDB, null, 2));
  
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
  console.log('\nWine Smart Contract CLI Starting...');
  
  // Ensure shared directories exist
  if (!fs.existsSync(SHARED_CONTRACTS_FOLDER)) {
    fs.mkdirSync(SHARED_CONTRACTS_FOLDER, { recursive: true });
  }
  
  // Start blockchain node
  await startNode();
  
  // Check if we need to update the IperChain node to include our contract creator account
  await checkAndUpdateNodeAccounts();
  
  // Show main menu
  showMainMenu();
}

// Check and update node accounts if needed
async function checkAndUpdateNodeAccounts() {
  try {
    const accounts = await rpcCall('eth_accounts');
    
    if (!accounts.includes(CONTRACT_CREATOR_ACCOUNT)) {
      console.log(`Contract creator account ${CONTRACT_CREATOR_ACCOUNT} not found in node.`);
      console.log('This account needs to be added to bin/iperchain-node.js');
      
      rl.question('\nWould you like to try to automatically update the node configuration? (y/n): ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
          console.log('This functionality would modify bin/iperchain-node.js to add the account.');
          console.log('For this demo, please add the account manually in the node code.');
        }
        
        showMainMenu();
      });
    }
  } catch (error) {
    console.error('Error checking accounts:', error.message);
  }
}

// Handle exit
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// Start the application
start(); 