'use strict';

const net = require('net');
const Connection = require('./Connection');

class Server{
    constructor(options, callback) {
        let that = this;
        this.connections = [];

        if(typeof options === "function"){
            callback = options;
            options = undefined;
        }

        let connectionListener = function(socket){
            let c = new Connection(socket, this, function (){
                that.connections.push(c);
                c.socket.removeListener('error', function (){});
                this.emit('connection', c);
            });

            c.socket.on('close', function () {
                let pos = that.connections.indexOf(c);
                if (pos !== -1) {
                    that.connections.splice(pos, 1);
                }
            });

            // Ignore errors before the connection is established
            c.socket.on('error', function (){});

        };

        this.socket = net.createServer(options, connectionListener);

        this.socket.on('close', function () {
            that.emit('close');
        });

        this.socket.on('error', function (err) {
            that.emit('error', err);
        });

        // Loops the server
        if (callback) {
            this.socket.on('connection', callback);
        }

    }
}

// Listens to host and port
Server.prototype.listen = function(port, host){
    this.socket.listen(port, host, function() {
        this.emit('listening')
    });
    return this;

};

module.exports = Server;
