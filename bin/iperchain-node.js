#!/usr/bin/env node

/**
 * IperChain Simplified Node
 * 
 * This is a simplified version of the IperChain node for testing purposes.
 * It simulates a blockchain node with basic RPC capabilities.
 */

const http = require('http');
const crypto = require('crypto');
const IperChainP2PNode = require('../network/p2p-node');

// --- PoA Simulation Start ---
// Define the list of Authority addresses (using existing test accounts)
const AUTHORITIES = [
  '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Associated with Producer CLI
  '0x123f681646d4a755815f9cb19e1acc8565a0c2ac', // Associated with Certifier CLI
  '0x456f681646d4a755815f9cb19e1acc8565a0c2ac', // Associated with Retailer CLI
  '0x999f681646d4a755815f9cb19e1acc8565a0c2ac'  // Associated with Contract Creator CLI
];
let currentAuthorityIndex = 0;
// --- PoA Simulation End ---

// Blockchain state
const state = {
  blocks: [],
  transactions: [],
  pendingTransactions: [],
  contracts: {},
  accounts: {},
  nextBlockNumber: 0,
  mining: false,
  miningInterval: null,
  p2pNode: null // P2P node instance
};

// Initialize genesis block
function initGenesisBlock() {
  const timestamp = Math.floor(Date.now() / 1000);
  const genesisBlock = {
    number: 0,
    hash: '0x' + crypto.createHash('sha256').update(`genesis-${timestamp}`).digest('hex'),
    parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    timestamp,
    transactions: [],
    miner: '0x0000000000000000000000000000000000000000',
    difficulty: '0x1',
    totalDifficulty: '0x1',
    size: '0x0',
    gasUsed: '0x0',
    gasLimit: '0x1000000'
  };
  
  state.blocks.push(genesisBlock);
  state.nextBlockNumber = 1;
  
  // Initialize test accounts
  state.accounts['0x742d35Cc6634C0532925a3b844Bc454e4438f44e'] = {
    balance: '1000000000000000000000', // 1000 ETH
    nonce: 0
  };
  
  state.accounts['0x123f681646d4a755815f9cb19e1acc8565a0c2ac'] = {
    balance: '1000000000000000000000', // 1000 ETH
    nonce: 0
  };
  
  state.accounts['0x456f681646d4a755815f9cb19e1acc8565a0c2ac'] = {
    balance: '1000000000000000000000', // 1000 ETH
    nonce: 0
  };
  
  state.accounts['0x999f681646d4a755815f9cb19e1acc8565a0c2ac'] = {
    balance: '1000000000000000000000', // 1000 ETH
    nonce: 0
  };
  
  console.log('Genesis block created:', genesisBlock.hash);
}

// Initialize P2P node
async function initP2PNode(port) {
  state.p2pNode = new IperChainP2PNode({
    port: port + 1, // Use port+1 for P2P to avoid conflict with RPC
    bootstrapList: [] // In production, this would contain known peers
  });

  // Set up message handlers
  state.p2pNode.setMessageHandlers({
    transaction: (tx) => {
      console.log('Received transaction from network:', tx.hash);
      if (!state.pendingTransactions.find(t => t.hash === tx.hash)) {
        state.pendingTransactions.push(tx);
      }
    },
    block: async (block) => {
      console.log('Received block from network:', block.hash);
      // Validate and add block if valid
      if (await validateBlock(block)) {
        addBlock(block);
      }
    },
    consensus: (msg) => {
      console.log('Received consensus message:', msg);
      handleConsensusMessage(msg);
    }
  });

  await state.p2pNode.init();
}

// Validate received block
async function validateBlock(block) {
  // Basic validation
  if (!block.hash || !block.parentHash) return false;
  
  // Check if we have the parent block
  const parentBlock = state.blocks.find(b => b.hash === block.parentHash);
  if (!parentBlock && block.number !== 0) return false;
  
  // Verify block proposer is a valid authority
  if (!AUTHORITIES.includes(block.miner)) return false;
  
  // More validation would be needed in production:
  // - Verify block signature
  // - Verify transactions
  // - Verify state transitions
  // - etc.
  
  return true;
}

// Add validated block to chain
function addBlock(block) {
  // Check if we already have this block
  if (state.blocks.find(b => b.hash === block.hash)) return;
  
  state.blocks.push(block);
  state.nextBlockNumber = Math.max(state.nextBlockNumber, block.number + 1);
  
  // Remove included transactions from pending
  const txHashes = block.transactions.map(tx => tx.hash);
  state.pendingTransactions = state.pendingTransactions.filter(
    tx => !txHashes.includes(tx.hash)
  );
  
  // Add transactions to main list
  state.transactions = [...state.transactions, ...block.transactions];
  
  console.log(`Added block #${block.number} to chain. Hash: ${block.hash}`);
}

// Handle consensus messages
function handleConsensusMessage(msg) {
  switch (msg.type) {
    case 'PROPOSE':
      // Handle block proposal
      break;
    case 'VOTE':
      // Handle block vote
      break;
    case 'COMMIT':
      // Handle block commit
      break;
  }
}

// Handle JSON-RPC requests
function handleRPCRequest(req, res) {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    let response = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    };
    
    try {
      const request = JSON.parse(body);
      response.id = request.id;
      
      // Process the method
      try {
        response.result = processMethod(request.method, request.params);
        delete response.error;
      } catch (err) {
        response.error = {
          code: -32603,
          message: 'Internal error',
          data: err.message
        };
      }
    } catch (err) {
      console.error('Invalid JSON:', err.message);
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response));
  });
}

// Process RPC methods
function processMethod(method, params) {
  console.log(`Processing method: ${method}`, params);
  
  switch (method) {
    case 'web3_clientVersion':
      return 'IperChain/v0.1.0';
    
    case 'net_version':
      return '1337'; // Local private network ID
    
    case 'eth_chainId':
      return '0x539'; // Hex for 1337
      
    case 'eth_blockNumber':
      return '0x' + (state.nextBlockNumber - 1).toString(16);
      
    case 'eth_getBlockByNumber':
      const blockNumber = parseInt(params[0], 16);
      const includeTransactions = params[1] || false;
      
      if (blockNumber >= state.blocks.length) {
        throw new Error('Block not found');
      }
      
      const block = { ...state.blocks[blockNumber] };
      
      if (!includeTransactions) {
        block.transactions = block.transactions.map(tx => tx.hash);
      }
      
      return block;
      
    case 'eth_getTransactionByHash':
      const txHash = params[0];
      const tx = state.transactions.find(t => t.hash === txHash);
      
      if (!tx) {
        return null;
      }
      
      return tx;
      
    case 'eth_sendTransaction':
      const txParams = params[0];
      const newTx = createTransaction(txParams);
      state.pendingTransactions.push(newTx);
      
      // Broadcast the transaction to the network
      if (state.p2pNode) {
        state.p2pNode.broadcastTransaction(newTx);
      }
      
      // Simulate immediate mining for testing
      if (!state.mining) {
        setTimeout(() => mineBlock(), 500);
      }
      
      return newTx.hash;
      
    case 'eth_getTransactionReceipt':
      const receiptTxHash = params[0];
      
      // First check in transactions
      const receiptTx = state.transactions.find(t => t.hash === receiptTxHash);
      
      if (!receiptTx) {
        console.log(`No receipt found for transaction: ${receiptTxHash}`);
        return null;
      }
      
      console.log(`Found receipt for transaction: ${receiptTxHash}`);
      
      // Simulate a transaction receipt
      const receipt = {
        transactionHash: receiptTx.hash,
        transactionIndex: '0x0',
        blockHash: receiptTx.blockHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
        blockNumber: receiptTx.blockNumber || '0x0',
        from: receiptTx.from,
        to: receiptTx.to,
        cumulativeGasUsed: '0x5208', // 21000 gas
        gasUsed: '0x5208',
        contractAddress: receiptTx.contractAddress || null,
        logs: [],
        status: '0x1' // success
      };
      
      console.log('Receipt:', receipt);
      return receipt;
      
    case 'eth_call':
      const callParams = params[0];
      const blockParam = params[1];
      
      if (!callParams.to) {
        throw new Error('To address is required');
      }
      
      const contractAddress = callParams.to;
      const contract = state.contracts[contractAddress];
      
      if (!contract) {
        return '0x';
      }
      
      // Simulate contract call based on data
      if (callParams.data && callParams.data.startsWith('0x70a08231')) {
        // balanceOf function: returns a balance of 100 tokens
        return '0x0000000000000000000000000000000000000000000000056bc75e2d63100000'; // 100 tokens
      } else if (callParams.data && callParams.data.startsWith('0x06fdde03')) {
        // name function
        return '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000a4970657220546f6b656e0000000000000000000000000000000000000000000000'; // "Iper Token"
      } else if (callParams.data && callParams.data.startsWith('0x18160ddd')) {
        // totalSupply function
        return '0x00000000000000000000000000000000000000000000152d02c7e14af6800000'; // 100000 tokens
      }
      
      return '0x';
      
    case 'eth_accounts':
      return Object.keys(state.accounts);
      
    case 'eth_estimateGas':
      return '0x5208'; // 21000 gas (standard transfer)
      
    case 'eth_getBalance':
      const address = params[0];
      
      if (state.accounts[address]) {
        return '0x' + BigInt(state.accounts[address].balance).toString(16);
      }
      
      return '0x0';
      
    case 'eth_getCode':
      const codeAddress = params[0];
      
      if (state.contracts[codeAddress]) {
        return state.contracts[codeAddress].bytecode;
      }
      
      return '0x';
      
    case 'eth_sendRawTransaction':
      const rawTx = params[0];
      
      // Simulate processing a raw transaction
      // In a real implementation, we would decode and verify the raw transaction
      const simpleTx = {
        hash: '0x' + crypto.createHash('sha256').update(rawTx).digest('hex'),
        from: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        to: rawTx.includes('6060604') ? null : '0x123f681646d4a755815f9cb19e1acc8565a0c2ac', // Contract creation if contains bytecode
        value: '0x0',
        gas: '0x5208',
        gasPrice: '0x3b9aca00',
        input: rawTx,
        nonce: '0x' + state.accounts['0x742d35Cc6634C0532925a3b844Bc454e4438f44e'].nonce.toString(16)
      };
      
      state.pendingTransactions.push(simpleTx);
      state.accounts['0x742d35Cc6634C0532925a3b844Bc454e4438f44e'].nonce++;
      
      // Simulate immediate mining for testing
      if (!state.mining) {
        mineBlock();
      }
      
      // If this is a contract creation, generate a contract address
      if (simpleTx.to === null) {
        const contractAddress = '0x' + crypto.createHash('sha256').update(simpleTx.hash + simpleTx.nonce).digest('hex').substring(0, 40);
        
        // Store the contract
        state.contracts[contractAddress] = {
          bytecode: '0x' + '6060604052600080fd00'.repeat(10), // Dummy bytecode
          storage: {},
          creator: simpleTx.from
        };
        
        console.log('Contract deployed at:', contractAddress);
      }
      
      return simpleTx.hash;
      
    case 'evm_mine':
      // Manually trigger mining of pending transactions
      console.log('Manually triggering mining...');
      mineBlocks(1);
      return true;
      
    default:
      console.log('Unhandled method:', method);
      return null;
  }
}

// Create a transaction object
function createTransaction(params) {
  const hash = '0x' + crypto.createHash('sha256').update(JSON.stringify(params) + Date.now()).digest('hex');
  const tx = {
    hash,
    from: params.from,
    to: params.to,
    value: params.value || '0x0',
    gas: params.gas || '0x5208',
    gasPrice: params.gasPrice || '0x3b9aca00',
    input: params.data || '0x',
    nonce: '0x' + state.accounts[params.from].nonce.toString(16)
  };
  
  state.accounts[params.from].nonce++;
  
  return tx;
}

// Mine a block
async function mineBlock() {
  console.log('Mining a new block...');
  
  if (state.pendingTransactions.length === 0) {
    console.log('No pending transactions to mine');
    return;
  }
  
  // --- PoA Simulation Start ---
  // Select the next authority in round-robin fashion
  const currentAuthority = AUTHORITIES[currentAuthorityIndex];
  currentAuthorityIndex = (currentAuthorityIndex + 1) % AUTHORITIES.length;
  console.log(`Block proposed by Authority: ${currentAuthority}`);
  // --- PoA Simulation End ---

  const blockNumber = state.nextBlockNumber;
  const timestamp = Math.floor(Date.now() / 1000);
  const transactions = [...state.pendingTransactions];
  const parentHash = state.blocks[blockNumber - 1].hash;
  
  // Process transactions
  transactions.forEach(tx => {
    // Update account balances for transfers
    if (tx.to && tx.value && BigInt(tx.value) > 0) {
      if (state.accounts[tx.from]) {
        state.accounts[tx.from].balance = (BigInt(state.accounts[tx.from].balance) - BigInt(tx.value)).toString();
      }
      
      if (state.accounts[tx.to]) {
        state.accounts[tx.to].balance = (BigInt(state.accounts[tx.to].balance) + BigInt(tx.value)).toString();
      } else {
        state.accounts[tx.to] = {
          balance: tx.value,
          nonce: 0
        };
      }
    }
    
    // Handle contract creation
    if (!tx.to && tx.input) {
      const contractAddress = '0x' + crypto.createHash('sha256').update(tx.hash + tx.nonce).digest('hex').substring(0, 40);
      
      // Store the contract
      state.contracts[contractAddress] = {
        bytecode: tx.input,
        storage: {},
        creator: tx.from
      };
      
      // Add contract address to the transaction
      tx.contractAddress = contractAddress;
      console.log(`Contract created at: ${contractAddress}`);
    }
    
    // Add block info to the transaction
    tx.blockNumber = '0x' + blockNumber.toString(16);
    tx.blockHash = '0x' + crypto.createHash('sha256').update(`block-${blockNumber}-${timestamp}`).digest('hex');
  });
  
  // Create the new block
  const newBlock = {
    number: '0x' + blockNumber.toString(16),
    hash: '0x' + crypto.createHash('sha256').update(`block-${blockNumber}-${timestamp}`).digest('hex'),
    parentHash,
    timestamp: '0x' + timestamp.toString(16),
    transactions,
    miner: currentAuthority, // Use the selected Authority as the miner
    difficulty: '0x1',
    totalDifficulty: '0x' + (blockNumber + 1).toString(16),
    size: '0x' + (1000 + transactions.length * 500).toString(16),
    gasUsed: '0x' + (transactions.length * 21000).toString(16),
    gasLimit: '0x1000000'
  };
  
  // Broadcast the block to the network
  if (state.p2pNode) {
    await state.p2pNode.broadcastBlock(newBlock);
  }
  
  // Add the block locally
  addBlock(newBlock);
  
  return newBlock;
}

// Start mining simulation (mine a block every 10 seconds)
function startMining() {
  if (state.mining) {
    return;
  }
  
  state.mining = true;
  state.miningInterval = setInterval(() => {
    if (state.pendingTransactions.length > 0) {
      mineBlock();
    }
  }, 10000);
  
  console.log('Mining started');
}

// Stop mining simulation
function stopMining() {
  if (!state.mining) {
    return;
  }
  
  state.mining = false;
  clearInterval(state.miningInterval);
  state.miningInterval = null;
  
  console.log('Mining stopped');
}

// Modify startServer to initialize P2P
async function startServer(port) {
  // Initialize blockchain
  initGenesisBlock();
  
  // Initialize P2P node
  await initP2PNode(port);
  
  // Create the HTTP server
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      handleRPCRequest(req, res);
    } else {
      res.statusCode = 405;
      res.end('Method Not Allowed');
    }
  });
  
  // Start listening
  server.listen(port, '127.0.0.1', () => {
    console.log(`IperChain node listening on http://127.0.0.1:${port}`);
    console.log('Genesis accounts:');
    Object.entries(state.accounts).forEach(([address, account]) => {
      console.log(`  ${address}: ${account.balance} wei`);
    });
    startMining();
  });
  
  // Handle server errors
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
  
  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    stopMining();
    if (state.p2pNode) {
      await state.p2pNode.stop();
    }
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const port = args.includes('--port') ? parseInt(args[args.indexOf('--port') + 1], 10) : 8545;

// Start the server
startServer(port); 