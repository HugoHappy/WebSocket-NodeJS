# WebSocket-NodeJS

A very simple nodejs module for websocket server

# How to use it
Install with `npm install websocket-nodejs` or put all files in a folder called "websocket-nodejs", and:
```javascript
var ws = require("websocket-nodejs")

var server = ws.createServer(function (conn) {
	console.log("New connection")
	conn.on("text", function (str) {
		conn.sendText(str)
	})
	conn.on("close", function (code, reason) {
		console.log("Connection closed")
	})
}).listen(8001)
```

Keep in mind this is just for a websocket server, see the samples for full implementation with client.

# ws
The main object, returned by `require("websocket-nodejs")`.

## ws.createServer(callback)
Returns a new `Server` object.
The `callback` function is automatically added to the `"connection"` event.

# Server
The class that represents a websocket server

## server.listen(port, host)
Starts to listen for connections on a given `port` and `host`.

## server.socket
Returning net.createServer()

## server.connections
An Array with every connections


# Connection
The class that represents a connection.

## connection.sendText(str, callback)
Sends a given string to the other side.

## connection.close([code, [reason]])
Starts the closing handshake (sends a close frame)

## connection.socket
The underlying net or tls socket

## connection.readyState
Constants representing the current state of the connection.
* connection.CONNECTING
* connection.OPEN
* connection.CLOSING
* connection.CLOSED

## connection.path
A string representing the path to which the connection was made.

## connection.headers
Read only map of header names and values.
