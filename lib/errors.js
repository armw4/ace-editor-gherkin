const makeError = require('make-error');

exports.FetchError = makeError('FetchError');

exports.ClientError = makeError('ClientError', FetchError);

exports.ServerError = makeError('ServerError', FetchError);
