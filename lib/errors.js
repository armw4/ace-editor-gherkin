const makeError = require('make-error');
const CompositeParserException = require('gherkin/lib/gherkin/errors').CompositeParserException;;

const FetchError = makeError('FetchError');
const ClientError = makeError('ClientError', FetchError);
const ServerError = makeError('ServerError', FetchError);
exports.FetchError = FetchError;
exports.ClientError = ClientError;
exports.ServerError = ServerError;

exports.handleError = (res, error) => {
  if (error instanceof ClientError) {
    res.status(error.response.status).send(error.message);
  } else if (error instanceof ServerError) {
    res.sendStatus(502);
  } else if (error instanceof CompositeParserException) {
    res.status(422).send(error.message);
  } else {
    console.error(error);
    res.sendStatus(500);
  }
};
