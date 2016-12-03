var crypto = require('crypto');

var app = require('express')();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var db = require('redis').createClient(6379, '127.0.0.1', {});

server.listen(3000);

app.use(require('cookie-parser')());
app.use(function(req, res, next) {
  if (req.cookies.uss) {
    var uss = JSON.parse(new Buffer(req.cookies.uss, 'base64').toString());
    db.get('user:'+ uss.user, function(data) {
      data = JSON.parse(data);
      if (data.token != uss.token) {
        res.clearCookie('uss');
        next();
      }
      next();
    })
  }
  next();
});
app.get('/', function(req, res) {
  res.sendfile('views/index.html');
});
io.clientSum = 0;
io.loginSum = 0;
io.on('connection', function(socket) {
  var auth = false;
  socket.on('message', function(json) {
    console.log(json);
    if ('user' in json) {
      db.get('user-'+json.user.username, function(err, user) {
        user = JSON.parse(user);
        if (user.token != json.user.token) {
          socket.emit('system', {status: 'warning', msg: '登录超时，请重新登陆'});
          if (auth) {
            auth = false;
            io.loginSum--;
          }
          return;
        } else {
          if (!auth) {
            auth = {username: json.user.username};
            io.loginSum++;
          }
        }
      });
    } else {
      auth = false;
    }
    switch (json.method) {
      case 'register':
        if (auth) {
          socket.emit('system', {status: 'warning', msg: auth.username+',你已登录'});
          return;
        }
        var username = json.param[0];
        var password = json.param[1];
        db.get('user-' + username, function(err, user) {
          if (user != null) {
            socket.emit('system', {status: 'danger', msg: '用户已存在，请尝试登录'});
            return;
          } else {
            password = crypto.createHash('md5').update(password, 'utf8').digest('hex');
            user = {
              password: password,
              token: '',
              point: 10000
            };
            db.set('user-' + username, JSON.stringify(user), function() {
              socket.emit('system', {status: 'success', msg: '注册成功'});
              return;
            })
          }
        });
        break;
      case 'login':
        if (auth) {
          socket.emit('system', {status: 'warning', msg: auth.username+',你已登录'});
          return;
        }
        var username = json.param[0];
        var password = json.param[1];
        db.get('user-' + username, function(err, user) {
          if (user == null) {
            socket.emit('system', {status: 'danger', msg: '用户不存在请尝试注册'});
          } else {
            user = JSON.parse(user);
            password = crypto.createHash('md5').update(password, 'utf8').digest('hex');
            if (password != user.password) {
              socket.emit('system', {status: 'danger', msg: '密码错误'});
              return;
            } else {
              var token = crypto.createHash('md5').update(Date(), 'utf8').digest('hex');
              user.token = token;
              db.set('user-' + username, JSON.stringify(user), function() {
                console.log('hi');
                auth = {username: username, token: token};
                io.loginSum++;

                socket.emit('system', {status: 'success', msg: '登陆成功！欢迎你，'+username, auth: auth});

                socket.broadcast.emit('system', {status: 'info', msg: username+'加入了'});
                user.token = '';
                setTimeout(function() {
                  db.set('user-'+username, JSON.stringify(user));
                }, 3600000);
                return;
              });
            }
          }
        })
        break;
      case 'logout':
        if (!auth) {
          socket.emit('system', {status: 'warning', msg: '尚未登陆'});
          return;
        }
        auth = false;
        io.loginSum--;
        socket.emit('system', {status: 'success', msg: '成功登出', auth:false});
        break;
      case 'say':
        if (auth) {
          io.sockets.emit('message', {status: 'primary', speaker: auth.username, msg: json.param[0]});
        } else {
          socket.emit('system', {status: 'warning', msg: '请先注册或登陆 使用/register [username] [password]注册 使用/login [username] [password]登陆'});
        }
        break;
      case 'list':
        socket.emit('system', {status: 'info', msg: '当前'+io.clientSum+'人在线，人'+io.loginSum+'登录'})
        break;
      case 'help':
        for (var i=0;i<manual.length;i++) {
          socket.emit('system', {status: 'info', msg: manual[i]});
        }
        break;
      case 'rus':
        break;
      case 'zjh':
        break;
      case 'p':
        db.get('user-'+auth.username, function(err, user) {
          if (!user.point) {
            user.point = 0;
          }
          socket.emit('system', {status: 'info', msg: '你当前的积分为： '+user.point})
        });
        break;
      default:
        socket.emit('system', {status: 'danger', msg: '无效的方法' + json.method + ' 请确认你的输入 /help可以获取命令列表'});
    }

  });

  socket.on('disconnect', function() {
    io.clientSum--;
  })
});
manual = [
  '/help 获取帮助',
  '/register [username] [password] 注册',
  '/login [username] [password] 登陆',
  '/logout 登出',
  '/say [what] 说话',
  '/list 列出在线人数和登陆人数',
  '/p 显示自己的积分',
  '/rus [弹仓数] [子弹数] 开启一盘俄罗斯轮盘赌',
  '/zjh [底数] [几幅牌] 开启一盘炸金花'
];
