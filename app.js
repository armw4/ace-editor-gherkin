var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var db = mongoose.connection;

var index = require('./routes/index');
var gherkin = require('./routes/gherkin');

var app = express();
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, _, next) => {
  req.origin = req.query.xdm_e || req.body.origin;
  next();
});

app.use('/', index);
app.use('/gherkin', gherkin);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use((err, req, res, next) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

mongoose.connect('mongodb://localhost/gherkin', {
  useMongoClient: true,
  // When your application starts up, Mongoose automatically calls ensureIndex for each defined index in your schema.
  // Mongoose will call ensureIndex for each index sequentially, and emit an 'index' event on the model when all the ensureIndex
  // calls succeeded or when there was an error. While nice for development, it is recommended this behavior be disabled
  // in production since index creation can cause a significant performance impact. Disable the behavior by setting the autoIndex
  // option of your schema to false, or globally on the connection by setting the option config.autoIndex to false.
  //config: {
    //autoIndex: app.get('env') === 'development'
  //}
});

mongoose.Promise = global.Promise;
db.on('error', console.error.bind(console, 'connection error:'));

module.exports = app;
