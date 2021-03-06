const http = require("http");
const ws = require("../");
const fs = require("fs");

http.createServer(function (req, res) {
    fs.createReadStream("index.html").pipe(res)
}).listen(8080);

let server = ws.createServer(function (connection) {
    connection.nickname = null;
    connection.on("text", function (str) {
        if (connection.nickname === null) {
            connection.nickname = str;
            broadcast(str+" entered")
        } else
            broadcast("["+connection.nickname+"] "+str)
    });
    connection.on("close", function () {
        broadcast(connection.nickname+" left")
    })
});
server.listen(8081);

function broadcast(str) {
    server.connections.forEach(function (connection) {
        connection.sendText(str)
    })
}