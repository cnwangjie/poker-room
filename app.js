var crypto = require('crypto');

var app = require('express')();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var db = require('redis').createClient(6379, '127.0.0.1', {});

server.listen(3000);

app.use(require('cookie-parser')());
app.use(function(req, res, next) {
  if (req.cookies.uss) {
    // 如果cookie中包含着虚假的或过期的cookie就直接帮助用户清除
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

// 返回前端
app.get('/', function(req, res) {
  res.sendfile('views/index.html');
});

// 系统属性
io.clientSum = 0;
io.loginSum = 0;

// 这是个模板
io.rus = {
  zds: 1,
  dcs: 6,
  sumofpoint: 100,
  player: ['a', 'b', 'c'],
  nowplayer: 0,
  point: [
    a = 1,
    b = 49,
    c = 50
  ],
  status: 'over'
};

// 一个连接
io.on('connection', function(socket) {

  // 这里的socket.auth表示当前的会话是否经过了身份验证
  // 如果验证通过则为客户端的属性 否则为false
  socket.auth = false;

  socket.on('message', function(json) {
    console.log(json);

    // 如果json中包含了用户信息 检查一下和数据库中的用户信息是否匹配
    if ('user' in json) {
      db.get('user-'+json.user.username, function(err, user) {
        user = JSON.parse(user);
        if (user.token != json.user.token) {
          socket.emit('system', {status: 'warning', msg: '登录超时，请重新登陆'});
          if (socket.auth) {
            socket.auth = false;
            io.loginSum--;
          }
          return;
        } else {
          if (!socket.auth) {
            socket.auth = {username: json.user.username};
            io.loginSum++;
          }
        }
      });
    } else {
      socket.auth = false;
    }

    // 前端已经把用户传出的消息的method分离出来了 这里根据不同的method进行不同的操作
    switch (json.method) {
      case 'register':
        if (socket.auth) {
          socket.emit('system', {status: 'warning', msg: socket.auth.username+',你已登录'});
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
        if (socket.auth) {
          socket.emit('system', {status: 'warning', msg: socket.auth.username+',你已登录'});
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
                socket.auth = {username: username, token: token};
                io.loginSum++;

                socket.emit('system', {status: 'success', msg: '登陆成功！欢迎你，'+username, auth: socket.auth});

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
        if (!socket.auth) {
          socket.emit('system', {status: 'warning', msg: '尚未登陆'});
          return;
        }
        socket.auth = false;
        io.loginSum--;
        socket.emit('system', {status: 'success', msg: '成功登出', auth:false});
        break;

      case 'say':
        if (socket.auth) {
          io.sockets.emit('message', {speaker: socket.auth.username, msg: json.param[0]});
        } else {
          socket.emit('system', {status: 'warning', msg: '请先注册或登陆 使用/register [username] [password]注册 使用/login [username] [password]登陆'});
        }
        break;

      case 'list':
        socket.emit('system', {status: 'info', msg: '当前'+io.clientSum+'人在线，'+io.loginSum+'人登录'});
        break;

      case 'help':
        for (var i=0;i<manual.length;i++) {
          socket.emit('system', {status: 'info', msg: manual[i]});
        }
        break;
      // 俄罗斯轮盘赌的部分
      // {
      //   zds: 1,
      //   dcs: 6,
      //   sumofpoint: 100,
      //   player: ['a', 'b', 'c'],
      //   nowplayer: 0,
      //   point: [
      //     a: 1,
      //     b: 49,
      //     c: 50
      //   ],
      //   status: 'over'
      // };
      case 'rus':
        if (!socket.auth) {
          socket.emit('system', {status: 'warning', msg: '尚未登陆'});
          return;
        }

        var dcs = json.param[0];
        var zds = json.param[1];
        if (io.rus.status != 'over') {
          socket.emit('system', {status: 'warning', msg: '当前有一局游戏正在进行'});
        } else if (zds >= dcs) {
          socket.emit('system', {status: 'warning', msg: '子弹数大于或等于弹仓数'});
        } else {
          io.rus = {
            zds: zds,
            dcs: dcs,
            sumofpoint: 0,
            player: [],
            nowplayer: -1,
            point: [],
            kqg: false,
            status: 'waiting'
          }
          io.sockets.emit('system', {status: 'info', msg: socket.auth.username+'开启的一盘俄罗斯轮盘赌 共'+zds+'发子弹，'+dcs+'个弹仓使用 /jr [赌注] 加入游戏，10秒钟后游戏开始'});
          setTimeout(function() {
            io.rus.status = 'running';
            io.sockets.emit('system', {status: 'info', msg: ''});
            rus();
          }, 10000);
        }
        break;

      case 'jr':
        if (!socket.auth) {
          socket.emit('system', {status: 'warning', msg: '尚未登陆'});
          return;
        }
        var dz = json.param[0] - 0;
        if (io.rus.status != 'waiting') {
          socket.emit('system', {status: 'warning', msg: '当前没有俄罗斯轮盘赌等待加入，请等待当前的游戏结束并使用 /rus [弹仓数] [子弹数] 重新开始一盘'});
        } else if (dz <= 0) {
          socket.emit('system', {status: 'warning', msg: '赌注呢？？？'});
        } else {
          io.rus.sumofpoint += dz;
          io.rus.player.push(socket.auth.username);
          io.rus.point[socket.auth.username] = dz;
          db.get('user-'+socket.auth.username, function(err, user) {
            var user = JSON.parse(user);
            if (user.point < dz) {
              socket.emit('system', {status: 'warning', msg: '你的积分不足'});
              return;
            } else {
              user.point -= dz;
              db.set('user'+socket.auth.username, JSON.stringify(user), function(err) {
                socket.emit('system', {status: 'info', msg: '你下注'+dz+'积分'});
                return;
              });
            }
          });
        }
        break;

      case 'kq':
        if (!socket.auth) {
          socket.emit('system', {status: 'warning', msg: '尚未登陆'});
          return;
        }

        kq(socket);
        break;

      case 'hr':
        if (!socket.auth) {
          socket.emit('system', {status: 'warning', msg: '尚未登陆'});
          return;
        }

        hr(socket);
        break;

      // 诈金花的部分
      case 'zjh':
        break;

      case 'setpoint':
        var username = json.param[0];
        var point = json.param[1] - 0;
        db.get('user-'+username, function(err, user) {
          if (user) {
            user = JSON.parse(user);
            user.point = point;
            db.set('user-'+username, JSON.stringify(user), function(err) {
              socket.emit('system', {status: 'success', msg: '设置成功'});
            });
          } else {
            socket.emit('system', {status: 'danger', msg: '不存在这个用户'});
          }
        });
        break;

      case 'p':
        if (!socket.auth) {
          socket.emit('system', {status: 'warning', msg: '尚未登陆'});
          return;
        }

        db.get('user-'+socket.auth.username, function(err, user) {
          user = JSON.parse(user);
          socket.emit('system', {status: 'info', msg: '你当前的积分为： '+user.point});
        });
        break;

      default:
        socket.emit('system', {status: 'danger', msg: '无效的方法' + json.method + ' 请确认你的输入 /help可以获取命令列表'});
      // 一个message事件的周期在这里结束
    }

  });
  io.clientSum++;

  socket.on('disconnect', function() {
    io.clientSum--;
  })
});

function hr(socket = null) {
  // 换人进程
  var player = io.rus.player[io.rus.nowplayer];
  if (socket == null) {
    return;
  } else if (socket.auth.username != io.rus.nowplayer) {
    socket.emit('system', {status: 'warning', msg: '枪不在你手上'});
  } else if (!io.rus.kqg) {
    socket.emit('system', {status: 'warning', msg: '你还没开枪呢'});
  }
  io.rus.nowplayer += 1;
  if (io.rus.nowplayer == io.rus.player.length) {
    io.rus.nowplayer = 0;
  }
  io.rus.kqg = false;
  io.sockets.emit('system', {status: 'info', msg: '现在轮到'+io.rus.player[io.rus.nowplayer]+'开枪，输入/kq开枪'});
  setTimeout(function() {
    kq();
  }, 10000);
}

function kq(socket = null) {
  // 一个开枪进程
  var player = io.rus.player[io.rus.nowplayer];
  if (socket == null) {
    if (io.rus.kqg) {
      hr();
      return;
    }
  } else if (socket.auth.username != player) {
    socket.emit('system', {status: 'warning', msg: '枪不在你手上'});
    return;
  }
  var s = Math.floor(Math.random() * io.rus.dcs);
  if (s < io.rus.zds) {
    io.sockets.emit('system', {status: 'info', msg: '砰！子弹穿过了'+player+'的脑袋！'});
    // 有子弹 计算得分
    io.rus.point[player] = 0;
    var sumofpoint = 0;
    for (i in io.rus.point) {
      sumofpoint += io.rus.point[i];
    }
    for (i in io.rus.point) {
      io.rus.point[i] = Math.round(io.rus.point/sumofpoint * io.rus.sumofpoint);
      db.get('user-'+i, function(err, user) {
        var user = JSON.parse(user);
        user.point += io.rus.point[i];
        db.set('user'+i, JSON.stringify(user), function(err) {
          io.sockets.emit('system', {status: 'info', msg: i+'赢得'+io.rus.point[i]+'积分'});
        });
      });
    io.sockets.emit('system', {status: 'info', msg: '游戏结束'});
    io.rus.status = 'over';
    }
  } else {
    io.rus.point[player] *= 2;
    io.rus.kqg = true;
    io.rus.dcs -= 1;
    io.sockets.emit('system', {status: 'info', msg: '咔！'+player+'存活了下来，你可以选择输入 /kq 再开一枪 或者输入 /hr 把抢给下一个人'});
    setTimeout(function() {
      hr();
    }, 10000);
  }
}

function rus() {
  // 一个俄罗斯轮盘赌游戏进程
  if (io.rus.player.length < 2) {
    io.sockets.emit('system', {status: 'info', msg: '玩家少于2人'});
    io.rus.status = 'over';
    return;
  }
  io.sockets.emit('system', {status: 'info', msg: '俄罗斯轮盘赌游戏开始'});

  io.rus.nowplayer++;
  if (io.rus.nowplayer == io.rus.player.length) {
    io.rus.nowplayer = 0;
  }
  io.rus.kqg = false;
  io.sockets.emit('system', {status: 'info', msg: '现在轮到'+io.rus.player[io.rus.nowplayer]+'开枪，输入/kq开枪'});
  setTimeout(function() {
    kq();
  }, 10000);

}

io.on('disconnect', function(socket) {
  io.clientSum--;
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
  '/zjh [底数] [几幅牌] 开启一盘炸金花',
  '/setpoint [username] [point] 设置玩家的分数'
];
