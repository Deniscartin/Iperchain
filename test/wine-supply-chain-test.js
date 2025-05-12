const IperChainP2PNode = require('../network/p2p-node');

// Test data
const PRODUCER_ID = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const CERTIFIER_ID = '0x123f681646d4a755815f9cb19e1acc8565a0c2ac';
const DISTRIBUTOR_ID = '0x456f681646d4a755815f9cb19e1acc8565a0c2ac';
const RETAILER_ID = '0x999f681646d4a755815f9cb19e1acc8565a0c2ac';

// Create test nodes for each actor
async function createTestNodes() {
    const nodes = {
        producer: new IperChainP2PNode({ port: 9546 }),
        certifier: new IperChainP2PNode({ port: 9547 }),
        distributor: new IperChainP2PNode({ port: 9548 }),
        retailer: new IperChainP2PNode({ port: 9549 })
    };

    // Initialize all nodes
    for (const [role, node] of Object.entries(nodes)) {
        await node.init();
        console.log(`${role.toUpperCase()} node initialized`);
    }

    return nodes;
}

// Test the complete wine supply chain process
async function testWineSupplyChain(nodes) {
    try {
        // 1. Producer creates a new wine batch
        const wineBatch = {
            id: 'BATCH_2024_001',
            producer: PRODUCER_ID,
            vintage: 2024,
            varietal: 'Sangiovese',
            region: 'Chianti Classico',
            quantity: 1000,
            bottleSize: '750ml',
            productionDate: new Date().toISOString(),
            status: 'PRODUCED'
        };

        console.log('\n1. Broadcasting new wine batch...');
        await nodes.producer.broadcastWineBatch(wineBatch);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Certifier issues certification
        const certification = {
            batchId: wineBatch.id,
            certifier: CERTIFIER_ID,
            certificationDate: new Date().toISOString(),
            docgVerified: true,
            alcoholContent: 13.5,
            certificationNumber: 'DOCG_2024_001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'CERTIFIED'
        };

        console.log('\n2. Broadcasting certification...');
        await nodes.certifier.broadcastCertification(certification);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Producer transfers batch to distributor
        const transfer = {
            batchId: wineBatch.id,
            from: PRODUCER_ID,
            to: DISTRIBUTOR_ID,
            transferDate: new Date().toISOString(),
            quantity: wineBatch.quantity,
            transportConditions: {
                temperature: '15C',
                humidity: '70%',
                transporterId: 'TRANS_001'
            },
            status: 'TRANSFERRED'
        };

        console.log('\n3. Broadcasting transfer to distributor...');
        await nodes.producer.broadcastTransfer(transfer);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 4. Distributor performs quality check
        const qualityCheck = {
            batchId: wineBatch.id,
            inspector: DISTRIBUTOR_ID,
            checkDate: new Date().toISOString(),
            temperature: '15.2C',
            humidity: '68%',
            sealIntact: true,
            bottleCondition: 'Excellent',
            notes: 'All bottles in perfect condition',
            status: 'QUALITY_CHECKED'
        };

        console.log('\n4. Broadcasting quality check results...');
        await nodes.distributor.broadcastQualityCheck(qualityCheck);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 5. Retailer records a sale
        const retailSale = {
            bottleId: `${wineBatch.id}_BOTTLE_001`,
            batchId: wineBatch.id,
            retailer: RETAILER_ID,
            saleDate: new Date().toISOString(),
            price: '45.99',
            paymentMethod: 'CREDIT_CARD',
            status: 'SOLD'
        };

        console.log('\n5. Broadcasting retail sale...');
        await nodes.retailer.broadcastRetailSale(retailSale);
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('\nSupply chain test completed successfully!');

    } catch (error) {
        console.error('Error during supply chain test:', error);
    }
}

// Setup message handlers for all nodes
function setupMessageHandlers(nodes) {
    for (const [role, node] of Object.entries(nodes)) {
        node.setMessageHandlers({
            wineBatch: (batch) => {
                console.log(`${role.toUpperCase()} received wine batch:`, batch.id);
            },
            certification: (cert) => {
                console.log(`${role.toUpperCase()} received certification for batch:`, cert.batchId);
            },
            transfer: (transfer) => {
                console.log(`${role.toUpperCase()} received transfer for batch:`, transfer.batchId);
            },
            qualityCheck: (check) => {
                console.log(`${role.toUpperCase()} received quality check for batch:`, check.batchId);
            },
            retailSale: (sale) => {
                console.log(`${role.toUpperCase()} received retail sale for bottle:`, sale.bottleId);
            }
        });
    }
}

// Main test function
async function runTest() {
    console.log('Starting wine supply chain test...\n');
    
    const nodes = await createTestNodes();
    setupMessageHandlers(nodes);
    
    // Wait for nodes to discover each other
    console.log('Waiting for peer discovery...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await testWineSupplyChain(nodes);
    
    // Cleanup: stop all nodes
    console.log('\nStopping nodes...');
    for (const node of Object.values(nodes)) {
        await node.stop();
    }
    
    console.log('Test completed.');
    process.exit(0);
}

// Run the test
runTest().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
}); 