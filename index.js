'use strict';
const Server = require('./Server');
exports.createServer = function(options, callback){
    return new Server(options, callback)
};
