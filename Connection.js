'use strict';

const util = require('util');
const events = require('events');
const crypto = require('crypto');
const Server = require('./Server');
const frame = require('./frame');

class Connection extends events{
    constructor(socket, options, callback) {
        super();
        let that = this;

        // Sets up variables
        this.server = options;
        this.socket = socket;
        this.readyState = this.CONNECTING;
        this.buffer = new Buffer(0);
        this.frameBuffer = null;
        this.headers = {};

        // Sets the readable listener
        socket.on('readable', function () {
            // What to do when reading from connection
            that.doRead()
        });

        // Sets the error listener
        socket.on('error', function (err) {
            // What to do when error
            //TODO: Error handling
        });

        // Close listener function
        let onClose = function () {
            if (that.readyState === that.CONNECTING || that.readyState === that.OPEN) {
                this.emit('close', 1006, '');
            }
            that.readyState = this.CLOSED;
        };

        // Sets a close and finish listener that fires only once
        socket.once('close', onClose);
        socket.once('finish', onClose);

        // Loops the connection
        if (callback) {
            this.socket.once('connect', callback)
        }
    }
}

// Closes the connection
Connection.prototype.close = function (code, reason) {
    if (this.readyState === this.OPEN) {
        this.socket.write(frame.createCloseFrame(code, reason, !this.server));
        this.readyState = this.CLOSING
    } else if (this.readyState !== this.CLOSED) {
        this.socket.end();
        this.readyState = this.CLOSED
    }
};


// Reads the stream from a client and saves it in this.buffer
Connection.prototype.doRead = function () {
    let buffer;
    let temp;

    buffer = this.socket.read();
    if (!buffer) {
        return
    }

    this.buffer = Buffer.concat([this.buffer, buffer], buffer.length + this.buffer.length);

    if (this.readyState === this.CONNECTING) {
        if (!this.readHandshake()) {
            return
        }
    }

    if (this.readyState !== this.CLOSED) {
        while ((temp = this.extractFrame()) === true) {}
        if (temp === false) {
            // Protocol error
            this.close(1002)
        } else if (this.buffer.length > Connection.maxBufferLength) {
            // Frame too big
            this.close(1009)
        }
    }
};

// Reads the opening handshake from a client
Connection.prototype.readHandshake = function () {
    let found = false;
    let i;
    let data;

    // Do the handshake and try to connect
    if (this.buffer.length > Connection.maxBufferLength) {
        // Too big for a handshake
        if (this.server) {
            this.socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
        } else {
            this.socket.end();
            this.emit('error', new Error('Handshake is too big'))
        }
        return false
    }

    // Search for '\r\n\r\n'
    for (i = 0; i < this.buffer.length - 3; i++) {
        if (this.buffer[i] === 13 && this.buffer[i + 1] === 10 &&
            this.buffer[i + 2] === 13 && this.buffer[i + 3] === 10) {
            found = true;
            break
        }
    }
    if (!found) {
        // Wait for more data
        return false
    }
    data = this.buffer.slice(0, i + 4).toString().split('\r\n');
    if (this.server) {
        this.answerHandshake(data);
        this.buffer = this.buffer.slice(i + 4);
        this.readyState = this.OPEN;
        this.socket.emit('connect');
        return true
    } else {
        this.socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return false
    }
};

// Decodes the frame from buffer
Connection.prototype.extractFrame = function () {
    let fin;
    let opcode, mask, len, payload, start, i, hasMask;


    if (this.buffer.length < 2) {
        return
    }

    fin = this.buffer[0]>>4 === 8;
    if(fin){
        opcode = this.buffer[0]-128;
    }

    hasMask = this.buffer[1] >> 7;
    len = this.buffer[1] - 128;
    start = hasMask ? 6 : 2;

    // Extract the payload
    payload = this.buffer.slice(start, start + len);
    if (hasMask) {
        // Decode with the given mask
        mask = this.buffer.slice(start - 4, start);
        for (i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4]
        }
    }
    this.buffer = this.buffer.slice(start + len);

    // Proceeds to frame processing
    return this.processFrame(fin, opcode, payload)
};

// Gets data from extractFrame and processes it
Connection.prototype.processFrame = function (fin, opcode, payload) {

    if (opcode === 0 && this.frameBuffer === null) {
        // Unexpected continuation frame
        return false
    } else if (opcode !== 0 && this.frameBuffer !== null) {
        // Last sequence didn't finished correctly
        return false
    }

    if (opcode === 1) {
        // Save text frame
        payload = payload.toString();
        this.frameBuffer = this.frameBuffer ? this.frameBuffer + payload : payload;

        if (fin) {
            // Emits 'text' event
            this.socket.emit('text', this.frameBuffer);
            this.frameBuffer = null
        }
    }

    if (opcode === 8) {
        // Close frame
        if (this.readyState === this.CLOSING) {
            this.socket.end()
        } else if (this.readyState === this.OPEN) {
            this.processCloseFrame(payload)
        }
        return true
    }else if (opcode === 9) {
        // Ping frame
        if (this.readyState === this.OPEN) {
            this.socket.write(frame.createPongFrame(payload.toString(), !this.server))
        }
        return true
    } else if (opcode === 10) {
        // Pong frame
        this.emit('pong', payload.toString());
        return true
    }

    if (this.readyState !== this.OPEN) {
        // Ignores if the connection isn't opened anymore
        return true
    }
    return true
};

// Sends a text frame
Connection.prototype.sendText = function (str, callback) {
    if (this.readyState === this.OPEN) {
        if (!this.outStream) {
            return this.socket.write(frame.createTextFrame(str, !this.server), callback)
        }
        this.emit('error', new Error('You can\'t send a text frame until you finish sending binary frames'))
    } else {
        this.emit('error', new Error('You can\'t write to a non-open connection'))
    }
};

// Sends a close frame
Connection.prototype.processCloseFrame = function (payload) {
    let code;
    let reason;

    if (payload.length >= 2) {
        code = payload.readUInt16BE(0);
        reason = payload.slice(2).toString()
    } else {
        code = 1005;
        reason = ''
    }
    this.socket.write(frame.createCloseFrame(code, reason, !this.server));
    this.readyState = this.CLOSED;
};

// Sends a confrim handshake to a client
Connection.prototype.answerHandshake = function (lines) {
    let path;
    let key;
    let sha1;

    path = lines[0].match(/^GET (.+) HTTP\/\d\.\d$/i);
    if (!path) {
        return false
    }
    this.path = path[1];

    // Saves headers in this.headers
    let match;
    for (let i = 1; i < lines.length; i++) {
        if ((match = lines[i].match(/^([a-z-]+): (.+)$/i))) {
            this.headers[match[1].toLowerCase()] = match[2]
        }
    }

    if (this.headers.upgrade.toString().toLowerCase() !== 'websocket' ||
        this.headers.connection.toString().toLowerCase() !== 'upgrade') {
        return false
    }
    if (this.headers['sec-websocket-version'] !== '13') {
        return false
    }

    this.key = this.headers['sec-websocket-key'];
    sha1 = crypto.createHash('sha1');
    sha1.end(this.key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
    key = sha1.read().toString('base64');

    let wsAnswer =
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + key +'\r\n';

    if(this.protocol){
        this.socket.write(wsAnswer + 'Sec-WebSocket-Protocol: ' + this.protocol + '\r\n');
    }else {
        this.socket.write(wsAnswer + '\r\n');
    }
    return true;
};

module.exports = Connection;

Connection.prototype.CONNECTING = 0;
Connection.prototype.OPEN = 1;
Connection.prototype.CLOSING = 2;
Connection.prototype.CLOSED = 3;