var app = require('express')();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var client = require('redis').createClient(6379, '127.0.0.1', {});

server.listen(3000);

app.get('/', function(req, res) {
  res.sendfile('views/index.html');
});

io.on('connection', function(socket) {
  socket.emit('open');

  socket.on('message')

  console.log(socket.handshake);
});
