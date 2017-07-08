const fetch = require('isomorphic-fetch');
const ClientError = require('./errors').ClientError;
const ServerError = require('./errors').ServerError;

const COMITTER = {
  name: 'Antwan Wimberly',
  email: 'no-reply@wimber.ly'
};

const FILE_BASE_URL = 'https://api.github.com/repos/armw4/ace-editor-gherkin/contents';

const createError = (response) => {
  const { status } = response;
  let error;

  if (status >= 400 && status < 500) {
    error = new ClientError(response.statusText)
  } else if (status >= 500 && status < 600) {
    error = new ServerError(response.statusText)
  } else {
    error = new Error(response.statusText)
  }

  error.response = response;

  return error;
};

const checkStatus = (response) => {
  const { status } = response;

  if (status >= 200 && status < 300) {
    return response.json();
  } else {
    var error = createError(response);
    throw error;
  }
};

const validateResponse = (response) => {
  if (response.ok) {
    return checkStatus(response);
  } else {
    const error = createError(response);
    throw error;
  }
};

const headers = () => {
  const credentials = `'armw4:${process.env.GITHUB_ACCESS_TOKEN}`;
  const encodedCredentials = encode(credentials)

  return {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Basic ${encodedCredentials}`
  };
};


const encode = (content) => new Buffer(content).toString('base64')

const decode = (content, encoding) => new Buffer(content, encoding).toString('utf8')

exports.featureFilePath = (issueKey) => '/features/' + issueKey + '.feature'

exports.getFeatureFile = async (issueKey) => {
  const url = FILE_BASE_URL + this.featureFilePath(issueKey)
  const response = await fetch(url, {
    headers: headers()
  });

  const data = await validateResponse(response);

  return Object.assign({}, data, {
    raw: decode(data.content, data.encoding)
  });
};

exports.createFeatureFile = async (issueKey, { content }) => {
  const url = FILE_BASE_URL + this.featureFilePath(issueKey)
  const body = {
    message: `Create feature ${issueKey}`,
    committer: COMITTER,
    content: encode(content)
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body)
  });

  const data = await validateResponse(response);

  return data;
};

exports.updateFeatureFile = async (issueKey, { content }) => {
  const { sha } = await this.getFeatureFile(issueKey);
  const url = FILE_BASE_URL + this.featureFilePath(issueKey);
  const body = {
    message: `Update feature ${issueKey}`,
    content: encode(content),
    committer: COMITTER,
    sha
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body)
  });

  const data = await validateResponse(response);

  return data;
};
