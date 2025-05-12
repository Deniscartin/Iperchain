const { Duplex } = require('stream');

// Convert stdin to a stream for libp2p
function stdinToStream(data) {
    const stream = new Duplex({
        read() {},
        write(chunk, encoding, callback) {
            console.log('> ' + chunk.toString('utf8').replace('\n', ''));
            callback();
        }
    });
    stream.push(data);
    return stream;
}

// Convert a stream to console output
function streamToConsole(stream) {
    stream.on('data', (data) => {
        console.log('< ' + data.toString('utf8').replace('\n', ''));
    });
}

module.exports = {
    stdinToStream,
    streamToConsole
}; 