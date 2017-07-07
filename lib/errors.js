const makeError = require('make-error');

const FetchError = makeError('FetchError');
const ClientError = makeError('ClientError', FetchError);
const ServerError = makeError('ServerError', FetchError);

exports.FetchError = FetchError;
exports.ClientError = ClientError;
exports.ServerError = ServerError;

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
