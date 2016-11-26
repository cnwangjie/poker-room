var app = require('express')();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

server.listen(80);

app.get('/', function(req, res) {
  res.sendfile('views/index.html');
});

io.set('log leverl', 1);

io.on('connection', function (socket) {
  socket.emit('open');

  console.log(socket.handshake);
});
