'use strict';

// Creates a text frame
exports.createTextFrame = function (data, masked) {
    let payload, meta;

    payload = new Buffer(data);
    meta = generateMetaData(true, 1, masked === undefined ? false : masked, payload);

    return Buffer.concat([meta, payload], meta.length + payload.length)
};

// Create a close frame
exports.createCloseFrame = function (code, reason, masked) {
    let payload, meta;

    if (code !== undefined && code !== 1005) {
        payload = new Buffer(reason === undefined ? '--' : '--' + reason);
        payload.writeUInt16BE(code, 0)
    } else {
        payload = new Buffer(0)
    }
    meta = generateMetaData(true, 8, masked === undefined ? false : masked, payload);

    return Buffer.concat([meta, payload], meta.length + payload.length)
};

//Create a ping frame
exports.createPingFrame = function (data, masked) {
    let payload, meta;

    payload = new Buffer(data);
    meta = generateMetaData(true, 9, masked === undefined ? false : masked, payload);

    return Buffer.concat([meta, payload], meta.length + payload.length)
};

// Create a pong frame
exports.createPongFrame = function (data, masked) {
    let payload, meta;

    payload = new Buffer(data);
    meta = generateMetaData(true, 10, masked === undefined ? false : masked, payload);

    return Buffer.concat([meta, payload], meta.length + payload.length)
};

// Creates the meta-data portion of the frame
function generateMetaData(fin, opcode, masked, payload) {
    let len, meta, start, mask, i;

    len = payload.length;

    // Creates the buffer for meta-data
    meta = new Buffer(2 + (len < 126 ? 0 : (len < 65536 ? 2 : 8)) + (masked ? 4 : 0));

    // Sets fin and opcode
    meta[0] = (fin ? 128 : 0) + opcode;

    // Sets the mask and length
    meta[1] = masked ? 128 : 0;
    start = 2;
    if (len < 126) {
        meta[1] += len
    } else if (len < 65536) {
        meta[1] += 126;
        meta.writeUInt16BE(len, 2);
        start += 2
    } else {
        meta[1] += 127;
        meta.writeUInt32BE(Math.floor(len / Math.pow(2, 32)), 2);
        meta.writeUInt32BE(len % Math.pow(2, 32), 6);
        start += 8
    }

    // Set the mask-key
    if (masked) {
        mask = new Buffer(4);
        for (i = 0; i < 4; i++) {
            meta[start + i] = mask[i] = Math.floor(Math.random() * 256)
        }
        for (i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4]
        }
    }
    return meta
}