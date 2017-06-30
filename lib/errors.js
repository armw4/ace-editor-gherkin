const makeError = require('make-error');

exports.FetchError = makeError('FetchError');

exports.ClientError = makeError('ClientError', FetchError);

exports.ServerError = makeError('ServerError', FetchError);

exports.handleError = (res, error) => {
  if (error instanceof ClientError) {
    res.sendStatus(e.response.status, e.message);
  } else if (error instanceof ServerError) {
    res.sendStatus(502, 'Proxied Connection Error');
  } else {
    console.error(error);
    res.sendStatus(500, 'Internal Server Error');
  }
};
