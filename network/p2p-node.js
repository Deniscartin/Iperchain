const Libp2p = require('libp2p');
const TCP = require('libp2p-tcp');
const Mplex = require('libp2p-mplex');
const { NOISE } = require('libp2p-noise');
const Gossipsub = require('libp2p-gossipsub');
const MulticastDNS = require('libp2p-mdns');
const PeerId = require('peer-id');
const { stdinToStream, streamToConsole } = require('./stream');

class IperChainP2PNode {
    constructor(options = {}) {
        this.nodeId = null;
        this.libp2p = null;
        this.options = {
            port: options.port || 0,
            topics: {
                WINE_BATCHES: 'iperchain/wine/batches/1.0.0',
                CERTIFICATIONS: 'iperchain/wine/certifications/1.0.0',
                TRANSFERS: 'iperchain/wine/transfers/1.0.0',
                QUALITY_CHECKS: 'iperchain/wine/quality/1.0.0',
                RETAIL_SALES: 'iperchain/wine/sales/1.0.0',
                BLOCKS: 'iperchain/blocks/1.0.0',
                CONSENSUS: 'iperchain/consensus/1.0.0'
            }
        };
        
        // Callbacks for handling messages
        this.messageHandlers = {
            wineBatch: null,
            certification: null,
            transfer: null,
            qualityCheck: null,
            retailSale: null,
            block: null,
            consensus: null
        };
    }

    async init() {
        // Generate or load PeerId
        this.nodeId = await PeerId.create();
        
        // Create libp2p node
        this.libp2p = await Libp2p.create({
            peerId: this.nodeId,
            addresses: {
                listen: [`/ip4/0.0.0.0/tcp/${this.options.port}`]
            },
            modules: {
                transport: [TCP],
                streamMuxer: [Mplex],
                connEncryption: [NOISE],
                pubsub: Gossipsub,
                peerDiscovery: [MulticastDNS]
            },
            config: {
                peerDiscovery: {
                    mdns: {
                        enabled: true
                    }
                },
                pubsub: {
                    enabled: true,
                    emitSelf: false
                }
            }
        });

        // Handle peer discovery
        this.libp2p.on('peer:discovery', (peerId) => {
            console.log(`Discovered peer: ${peerId.toB58String()}`);
        });

        // Handle peer connections
        this.libp2p.connectionManager.on('peer:connect', (connection) => {
            console.log(`Connected to peer: ${connection.remotePeer.toB58String()}`);
        });

        this.libp2p.connectionManager.on('peer:disconnect', (connection) => {
            console.log(`Disconnected from peer: ${connection.remotePeer.toB58String()}`);
        });

        // Start libp2p first
        await this.libp2p.start();
        console.log('P2P node started with PeerId:', this.nodeId.toB58String());
        
        // Subscribe to topics after the node is started
        await this.subscribeToTopics();
        
        // Log listen addresses
        console.log('Listening on addresses:');
        this.libp2p.multiaddrs.forEach(addr => {
            console.log(addr.toString());
        });
    }

    async subscribeToTopics() {
        // Subscribe to wine batch events
        this.libp2p.pubsub.subscribe(this.options.topics.WINE_BATCHES, (msg) => {
            const batch = JSON.parse(msg.data.toString());
            console.log('Received wine batch event:', batch.id);
            if (this.messageHandlers.wineBatch) {
                this.messageHandlers.wineBatch(batch);
            }
        });

        // Subscribe to certification events
        this.libp2p.pubsub.subscribe(this.options.topics.CERTIFICATIONS, (msg) => {
            const certification = JSON.parse(msg.data.toString());
            console.log('Received certification:', certification.batchId);
            if (this.messageHandlers.certification) {
                this.messageHandlers.certification(certification);
            }
        });

        // Subscribe to transfer events
        this.libp2p.pubsub.subscribe(this.options.topics.TRANSFERS, (msg) => {
            const transfer = JSON.parse(msg.data.toString());
            console.log('Received transfer:', transfer.batchId);
            if (this.messageHandlers.transfer) {
                this.messageHandlers.transfer(transfer);
            }
        });

        // Subscribe to quality check events
        this.libp2p.pubsub.subscribe(this.options.topics.QUALITY_CHECKS, (msg) => {
            const check = JSON.parse(msg.data.toString());
            console.log('Received quality check:', check.batchId);
            if (this.messageHandlers.qualityCheck) {
                this.messageHandlers.qualityCheck(check);
            }
        });

        // Subscribe to retail sale events
        this.libp2p.pubsub.subscribe(this.options.topics.RETAIL_SALES, (msg) => {
            const sale = JSON.parse(msg.data.toString());
            console.log('Received retail sale:', sale.bottleId);
            if (this.messageHandlers.retailSale) {
                this.messageHandlers.retailSale(sale);
            }
        });

        // Subscribe to block events
        this.libp2p.pubsub.subscribe(this.options.topics.BLOCKS, (msg) => {
            const block = JSON.parse(msg.data.toString());
            console.log('Received block:', block.hash);
            if (this.messageHandlers.block) {
                this.messageHandlers.block(block);
            }
        });

        // Subscribe to consensus messages
        this.libp2p.pubsub.subscribe(this.options.topics.CONSENSUS, (msg) => {
            const consensusMsg = JSON.parse(msg.data.toString());
            console.log('Received consensus message:', consensusMsg.type);
            if (this.messageHandlers.consensus) {
                this.messageHandlers.consensus(consensusMsg);
            }
        });
    }

    // Method to broadcast a new wine batch
    async broadcastWineBatch(batch) {
        try {
            await this.libp2p.pubsub.publish(
                this.options.topics.WINE_BATCHES,
                Buffer.from(JSON.stringify(batch))
            );
            console.log('Wine batch broadcast:', batch.id);
        } catch (err) {
            console.error('Error broadcasting wine batch:', err);
        }
    }

    // Method to broadcast a certification
    async broadcastCertification(certification) {
        try {
            await this.libp2p.pubsub.publish(
                this.options.topics.CERTIFICATIONS,
                Buffer.from(JSON.stringify(certification))
            );
            console.log('Certification broadcast:', certification.batchId);
        } catch (err) {
            console.error('Error broadcasting certification:', err);
        }
    }

    // Method to broadcast a transfer
    async broadcastTransfer(transfer) {
        try {
            await this.libp2p.pubsub.publish(
                this.options.topics.TRANSFERS,
                Buffer.from(JSON.stringify(transfer))
            );
            console.log('Transfer broadcast:', transfer.batchId);
        } catch (err) {
            console.error('Error broadcasting transfer:', err);
        }
    }

    // Method to broadcast a quality check
    async broadcastQualityCheck(check) {
        try {
            await this.libp2p.pubsub.publish(
                this.options.topics.QUALITY_CHECKS,
                Buffer.from(JSON.stringify(check))
            );
            console.log('Quality check broadcast:', check.batchId);
        } catch (err) {
            console.error('Error broadcasting quality check:', err);
        }
    }

    // Method to broadcast a retail sale
    async broadcastRetailSale(sale) {
        try {
            await this.libp2p.pubsub.publish(
                this.options.topics.RETAIL_SALES,
                Buffer.from(JSON.stringify(sale))
            );
            console.log('Retail sale broadcast:', sale.bottleId);
        } catch (err) {
            console.error('Error broadcasting retail sale:', err);
        }
    }

    // Method to broadcast a new block
    async broadcastBlock(block) {
        try {
            await this.libp2p.pubsub.publish(
                this.options.topics.BLOCKS,
                Buffer.from(JSON.stringify(block))
            );
            console.log('Block broadcast:', block.hash);
        } catch (err) {
            console.error('Error broadcasting block:', err);
        }
    }

    // Method to broadcast a consensus message
    async broadcastConsensusMessage(message) {
        try {
            await this.libp2p.pubsub.publish(
                this.options.topics.CONSENSUS,
                Buffer.from(JSON.stringify(message))
            );
            console.log('Consensus message broadcast:', message.type);
        } catch (err) {
            console.error('Error broadcasting consensus message:', err);
        }
    }

    // Set message handlers
    setMessageHandlers(handlers) {
        this.messageHandlers = { ...this.messageHandlers, ...handlers };
    }

    // Get connected peers
    getPeers() {
        return Array.from(this.libp2p.peerStore.peers.values());
    }

    // Get peer info
    async getPeerInfo(peerId) {
        return await this.libp2p.peerStore.get(peerId);
    }

    // Stop the node
    async stop() {
        if (this.libp2p) {
            await this.libp2p.stop();
            console.log('P2P node stopped');
        }
    }
}

module.exports = IperChainP2PNode; 