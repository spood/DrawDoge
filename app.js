/**
 * Module dependencies.
 */

var express = require('express')
  , hash = require('./pass').hash;

var app = module.exports = express();

// config

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

app.use(express.static(__dirname + '/public'));

// middleware

app.use(express.bodyParser());
app.use(express.cookieParser('shhhh, very secret'));
app.use(express.session());

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

// dummy database

var users = {};

function createAccount(username, pass1, pass2, email, fn) {
  console.log(username, pass1, pass2, email);
  var username = username;
  var email = email;
  if(!username || username.length > 100 || username.length <= 0) {
    fn(new Error("Username must be between 1 and 100 characters"));
  }
  else if(!pass1 || pass1.length > 100 || pass1.length <= 0) {
    fn(new Error("Password must be between 1 and 100 characters"));
  }
  else if(!email || email.length > 100 || email.length <= 0) {
    fn(new Error("Email must be between 1 and 100 characters"));
  }
  else if(users[username]) {
    fn(new Error("Username already exists"));
  }
  else if(email in users) {
    fn(new Error("Email is already in use"));
  }
  else if(pass1 != pass2) { 
    fn(new Error("Passwords are not equal"));
  }
  else {
    // no errors yay!
    hash(pass1, function(err, salt, hash){
      if (err) fn(err);
      // store the salt & hash in the "db"
      var newUser = { "name" : username,
                      "salt" : salt,
                      "hash" : hash,
                      "email" : email,
                      "balance" : "0.00",
                      "publickey" : "wasd" };
      users[username] = newUser;
      fn();
    });
  }
}

createAccount('root', 'root', 'root',"wd@gmail.com", function(err){});
createAccount('tj', 'foobar', 'foobar',"wasd@gmail.com", function(err){});


// Authenticate using our plain-object database of doom!

function authenticate(name, pass, fn) {
  if (!module.parent) console.log('authenticating %s:%s', name, pass);
  var user = users[name];
  // query the db for the given username
  if (!user) return fn(new Error('cannot find user'));
  // apply the same algorithm to the POSTed password, applying
  // the hash against the pass / salt, if there is a match we
  // found the user
  hash(pass, user.salt, function(err, hash){
    if (err) return fn(err);
    if (hash == user.hash) return fn(null, user);
    fn(new Error('invalid password'));
  })
}

function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
}

app.use(function(req, res, next){
  if (req.session.user) {
    res.locals.loggedIn = 1;
    res.locals.username = req.session.user["name"];
    res.locals.balance = users[res.locals.username].balance;
  }
  else {
    res.locals.loggedIn = 0;
  }
  next();
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
  authenticate(req.body.username, req.body.password, function(err, user){
    if (user) {
      // Regenerate session when signing in
      // to prevent fixation 
      req.session.regenerate(function(){
        // Store the user's primary key 
        // in the session store to be retrieved,
        // or in this case the entire user object
        req.session.user = user;
        req.session.success = 'Authenticated as ' + user.name
          + ' click to <a href="/logout">logout</a>. '
          + ' You may now access <a href="/restricted">/restricted</a>.';
        res.redirect('back');
      });
    } else {
      req.session.error = 'Authentication failed, please check your '
        + ' username and password. <br>'
        + err;
      res.redirect('login');
    }
  });
});

app.post('/createAccount', function(req, res){
  createAccount(req.body.username, req.body.password1, req.body.password2, req.body.email, function(err){
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
          req.session.user = user;
          req.session.successAlert = 'Account <strong>' + user.name + '</strong> successfully created';
          res.send({"redirect":'/'});
        });
      });
    }
  });
});

if (!module.parent) {
  app.listen(3000);
  console.log('Express started on port 3000');
}
