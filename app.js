/**
 * Module dependencies.
 */

var express = require('express')
  , hash = require('./pass').hash
  , exec = require('child_process').exec
  , config = require('./config.json')
  , mongo = require('mongodb')
  , monk = require('monk')
  , db = monk('localhost:27017/drawdoge')
  , http = require('http')
  , Canvas = require('canvas')
  , canvas = new Canvas(1660,768)
  , ctx = canvas.getContext('2d')
  , fs = require('fs')
  , connect = require('connect');
var secret = 'Dec 24 02:08:08.2571212 [FileAllocator] allocating new datggggawafile /home/spood/clickerGame/data/local';
var cookieParser =  express.cookieParser(secret);
var sessionStore = new connect.middleware.session.MemoryStore();
var app = express();
var server = http.createServer(app)


loadCanvas();

var m_players;

var io = require('socket.io').listen(server);

io.set('log level', 1);

// config

var dogecoind = config.dogecoind;

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

app.use(express.static(__dirname + '/public'));

// middleware

app.use(express.bodyParser());
app.use(cookieParser);
app.use(express.session({store: sessionStore, key: 'express.sid'}));


function createDogeAddress(account, fn) {
  var fn = fn;
  exec(dogecoind + ' getnewaddress ' + account, function callback(error, stdout, stderr){
    if(error) { console.log(error); fn(null)}
    console.log("generated address:",stdout);
    fn(stdout);
  });
}

function getBalance(account, fn) {
  var account = account;
  var fn = fn;
  var users = db.get('usercollection');
  users.findOne({'name':account},function(e,user){
    if(!user) {
      return fn(new Error('cannot find user'));
    }

    var balancespent = user.balancespent;

    exec(dogecoind + ' getbalance ' + account, function callback(error, stdout, stderr) {
      if(error) { console.log(error); fn(0);}
      var balance = parseFloat(stdout);
      users.findAndModify({'name':account},{$set: { 'balances': balance }},function(e,user){
        if(!user) {
          console.log("getBalance cannot find user", account);
          return fn(new Error('cannot find user'));
        }
        fn(balance - balancespent);
      });
    });
  });
}

function spendBalance(account, amount, fn) {
  var account = account;
  var fn = fn;
  var users = db.get('usercollection');

  users.findAndModify({'name':account},{$inc: { 'balancespent': amount }},function(e){
    if(e) {
      console.log("spendBalance error", e);
      return fn(new Error(e));
    }
    fn();
  });
}

// Session-persisted message middleware

app.use(function(req, res, next){
  var err = req.session.error
    , msg = req.session.success
    , alert = req.session.successAlert;
  delete req.session.error;
  delete req.session.success;
  delete req.session.successAlert;
  res.locals.message = '';
  res.locals.alert = '';
  if (err) res.locals.message = '<p class="msg error">' + err + '</p>';
  if (msg) res.locals.message = '<p class="msg success">' + msg + '</p>';
  if (alert) res.locals.alert = alert;

  next();
});

function createAccount(username, pass1, pass2, email, fn) {
  console.log(username, pass1, pass2, email);
  var username = username;
  var email = email;
  var users = db.get('usercollection');
  var fn = fn;
  var dogeAddress = null;

  if(!username || username.length > 100 || username.length <= 0) {
    fn(new Error("Username must be between 1 and 100 characters"));
  }
  else if(!pass1 || pass1.length > 100 || pass1.length <= 0) {
    fn(new Error("Password must be between 1 and 100 characters"));
  }
  else if(!email || email.length > 100 || email.length <= 0 || email.indexOf("@") == -1) {
    fn(new Error("Email must be between 1 and 100 characters"));
  }
  else if(pass1 != pass2) { 
    fn(new Error("Passwords are not equal"));
  }
  else {
    // check if username already exists
    users.count({'name':username},function(e,numberUsers){
      if(numberUsers == 0) {
        // check if email already exists
        users.count({'email':email},function(e,numberUsers){
          if(numberUsers == 0) {
            // no errors yay!
            hash(pass1, function(err, salt, hash){
              if (err) fn(err);
              createDogeAddress(username, function(addrs) { 
                dogeAddress = addrs;
                if(dogeAddress == null) {
                  fn("Failed to generate your doge address :(");
                  return;
                }
                // store the salt & hash in the "db"
                var newUser = { "name" : username,
                                "salt" : salt,
                                "hash" : hash,
                                "email" : email,
                                "balance" : 0,
                                "balancespent" : 0,
                                "publickey" : dogeAddress };
                users.insert(newUser, function (err, doc) {
                    if (err) {
                      // If it failed, return error
                      console.log("There was a problem adding the information to the database.");
                    }
                    else {
                      fn(null,dogeAddress);
                    }
                }); // users.insert
              }); // createDogeAddress
            }); // hash
          }
          else {
            fn(new Error("Email is already in use"));
          }
        });
      }
      else {
        fn(new Error("Username is already in use"));
      }
    });
  }
}

// Authenticate using our plain-object database of doom!

function authenticate(name, pass, fn) {
  if (!module.parent) console.log('authenticating %s:%s', name, pass);
  var users = db.get('usercollection');

  users.findOne({'name':name},function(e,user){
    if(!user) {
      return fn(new Error('cannot find user'));
    }
    // apply the same algorithm to the POSTed password, applying
    // the hash against the pass / salt, if there is a match we
    // found the user
    hash(pass, user.salt, function(err, hash){
      if (err) return fn(err);
      if (hash == user.hash) return fn(null, user, user.publickey);
      fn(new Error('invalid password'));
    })
  });
}

function restrict(req, res, next) {
  if (req.session.name) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
}

app.use(function(req, res, next){
  if (req.session.name) {
    res.locals.loggedIn = 1;
    res.locals.username = req.session.name;
    res.locals.dogeaddress = req.session.address;
    getBalance(res.locals.username, function(balance) {
      res.locals.balance = parseFloat(Math.round(balance * 100) / 100).toFixed(2);
      next();
    });
  }
  else {
    res.locals.loggedIn = 0;
    next();
  }
});

app.get('/', function(req, res){
  res.render('index');
});

app.get('/restricted', restrict, function(req, res){
  res.send('Wahoo! restricted area, click to <a href="/logout">logout</a>');
});

app.get('/logout', function(req, res){
  // destroy the user's session to log them out
  // will be re-created next request
  req.session.destroy(function(){
    res.redirect('/');
  });
});

app.get('/login', function(req, res){
  res.render('login');
});

app.post('/login', function(req, res){
  authenticate(req.body.username.toString(), req.body.password.toString(), function(err, user, address){
    if (user) {
      // Regenerate session when signing in
      // to prevent fixation 
      req.session.regenerate(function(){
        // Store the user's primary key 
        // in the session store to be retrieved,
        // or in this case the entire user object
        req.session.name = user.name;
        req.session.success = 'Authenticated as ' + user.name
          + ' click to <a href="/logout">logout</a>. '
          + ' You may now access <a href="/restricted">/restricted</a>.';
        req.session.address = address;
        res.redirect('back');
      });
    } else {
      req.session.error = 'Authentication failed, please check your '
        + ' username and password. <br>'
        + err;
      res.redirect('/');
    }
  });
});

app.post('/createAccount', function(req, res){
  createAccount(req.body.username.toString(), req.body.password1.toString(), req.body.password2.toString(), req.body.email.toString(), function(err,address){
    if(err) {
      console.log('' + err);
      res.send({"msg":'' + err});
    }
    else {
      authenticate(req.body.username, req.body.password1, function(err, user){
        req.session.regenerate(function(){
          // Store the user's primary key 
          // in the session store to be retrieved,
          // or in this case the entire user object
          req.session.address = address;
          req.session.name = user.name;
          req.session.successAlert = 'Account <strong>' + user.name + '</strong> successfully created';
          res.send({"redirect":'/'});
        });
      });
    }
  });
});

function loadCanvas() {
  fs.readFile(__dirname + '/public/images/canvas.png', function(err, file){
    if (err) throw err;
    img = new Canvas.Image;
    img.src = file;
    ctx.drawImage(img, 0, 0, img.width, img.height);
  });
}

// write out to file on ctrl+C
process.on('SIGINT', function () {
  var out = fs.createWriteStream(__dirname + '/public/images/canvas.png')
    , stream = canvas.createPNGStream();

  stream.on('data', function(chunk){
    out.write(chunk);
  });
  stream.on('end', function() {
    out.end();
  });

  out.on('finish', function() {
    console.log("wrote new image to canvas.png");
    server.close();
    process.exit();
  });
});


function addStrokeToCanvas(data) {
    var color = data.color;
    ctx.lineWidth = data.strokeWidth;
    ctx.beginPath();
    var i=0;
    while(i < data.points.length) {
      ctx.lineTo(data.points[i][0], data.points[i][1]);
      ctx.strokeStyle = color;
      ctx.stroke();
      i++;
    }
    ctx.closePath();
}

m_players = [];

i = 0;

io.set('authorization', function(data, accept) {
  cookieParser(data, {}, function(err) {
    if (err) {
      accept(err, false);
    } else {
      sessionStore.get(data.signedCookies['express.sid'], function(err, session) {
        if (err || !session) {
          accept('Session error', false);
        } else {
          data.session = session;
          accept(null, true);
        }
      });
    }
  });
});

io.sockets.on('connection', function(socket) {
  console.log("New connection: " + socket.id);

  socket.session = socket.handshake.session;
  m_players[i] = {'id' : socket.id, 'x' : 0, 'y' : 0};

  if(socket.session.name) {
    console.log("name",socket.session.name);
    m_players[i].name = socket.session.name;
  }
  i++;

  socket.on('client_connected', function(data) {
    try {
      for (x = 0, _ref = m_players.length; 0 <= _ref ? x <= _ref : x >= _ref; 0 <= _ref ? x++ : x--) {
        if (m_players[x].id === socket.id) {
          m_players[x].safename = data.name;
          break;
        }
      }
    } catch (err) {
      console.log(err);
    }
    // send canvas to neew connection
    canvas.toDataURL('image/png', function(err, b64){
      var str = {
        'id' : socket.id,
        'img' : b64
      };
      io.sockets.socket(socket.id).emit('canvas', str);
    });
    
    return io.sockets.emit("send_data", m_players);
  });
  socket.on('send_stroke', function(data) {
    console.log("sent stroke",data.id);
    var username;
    var id = data.id;
    var color = data.color;
    var strokeWidth = data.strokeWidth;
    var points = data.points;
    var colorRegex = /^#[0-9A-Fa-f]{6}$/;

    // make sure they're logged in before doing anything
    try {
      for (x = 0, _ref = m_players.length; 0 <= _ref ? x <= _ref : x >= _ref; 0 <= _ref ? x++ : x--) {
        if (m_players[x].id === socket.id) {
          console.log(x,m_players[x].name);
          if(m_players[x].name) {
            username = m_players[x].name;
            break;
          }
          else {
            return;
          }
        }
      }
    } catch (err) {
      console.log(err);
      return;
    }


    if(color.length != 7 || !color.match(colorRegex)) {
      console.log("color didnt match", color);
      return;
    }
    if(points.length > 1000) {
      console.log("points greater than 1k");
      return;
    }
    if(strokeWidth == 1 || strokeWidth == 2 || strokeWidth == 5 || strokeWidth == 8 || strokeWidth == 12 || strokeWidth == 15) {
      getBalance(username, function(balance) {
        console.log("balance",balance);
        var cost = calcDogeCost(points, strokeWidth);
        console.log("cost",cost);
        // cant afford to place the line they want
        if(cost > balance) {
          var cantafford = {
            "problem" : 1,
            "balance" : balance,
            "cost" : cost
          };
          io.sockets.socket(socket.id).emit('drawproblem', cantafford);
          return;
        }
        spendBalance(username, cost, function(err) {
          if(err) {
            return;
          }
          console.log("added");
          addStrokeToCanvas(data);
          io.sockets.socket(socket.id).emit('newbalance', (balance - cost).toFixed(2));
          return io.sockets.emit("update_stroke", [data]);
        });
      });
    };
  });

  socket.on('update_coords', function(pos) {
    var x, _ref;
    var safeplayers= [];
    try {
      for (x = 0, _ref = m_players.length; 0 <= _ref ? x <= _ref : x >= _ref; 0 <= _ref ? x++ : x--) {
        if (m_players[x].id === socket.id) {
          m_players[x].x = pos.x;
          m_players[x].y = pos.y;
          break;
        }
      }
    } catch (err) {
      console.log("update_coords",err,x);
    }
    m_players.forEach(function(player, index) {
      safeplayers[index] = {
        "x" : player.x,
        "y" : player.y,
        "name" : player.safename
      };
    });
    return io.sockets.emit("send_data", safeplayers);
  });
  return socket.on('disconnect', function() {
    var j, n, tmp, x;
    var safeplayers = [];
    j = 0;
    n = 0;
    tmp = [];
    while (n < m_players.length) {
      if (m_players[j].id === socket.id) {
        n++;
        break;
      }
      if (n < m_players.length) {
        tmp[j] = m_players[n];
        j++;
        n++;
        break;
      }
    }
    m_players = tmp;
    i = j;


    try {
      m_players.forEach(function(player, index) {
          safeplayers[index] = {
            "x" : player.x,
            "y" : player.y,
            "name" : player.safename
          };
      });
    } catch (err) {
      console.log("disconnect function",err);
    }
    return io.sockets.emit('send_data', safeplayers);
  });
});

function calcDogeCost(points,size) {
  var i = 0;
  var totalDistance = 0;
  while(i < points.length) {
    var point1 = points[i];
    i++;
    if(i < points.length) {
      var point2 = points[i];
      totalDistance += lineDistance(point1, point2);
    }
  }
  var cost = ((totalDistance / 1000) * size).toFixed(2);
  if(cost < 0.01) {
    cost = 0.01;
  }
  return parseFloat(cost);
}

function lineDistance( point1, point2 )
{
  var xs = 0;
  var ys = 0;
   
  xs = point2[0] - point1[0];
  xs = xs * xs;
   
  ys = point2[1] - point1[1];
  ys = ys * ys;
   
  return Math.sqrt( xs + ys );
}



if (!module.parent) {
  server.listen(80);
  console.log('Express started on port 80');
}
