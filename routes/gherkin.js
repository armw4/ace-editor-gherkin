const express = require('express');
const router = express.Router();
const cucumber = require('cucumber');
const github = require('../lib/github');
const workItem = require('../lib/work-item');
const ClientError = require('../lib/errors').ClientError;
const ServerError = require('../lib/errors').ServerError;
const camelize = require('camelize');

router.get('/:issueKey', (req, res) => {
  const { issueKey } = req.params;
  if (!workItem.exists(issueKey)) {
    res.sendStatus(404, 'Not Found');
  }

  const item = workItem.getWorkItem(issueKey);
  const featureFile = github.getFeatureFile(issueKey);
  const consolidatedResource = camelize({
    ...item,
    ...featureFile
  });

  res.send(consolidatedResource);
});

router.put('/:issueKey', async (req, res) => {
  const { issueKey } = req.params;
  const workItemExists = workItem.exists(issueKey);
  const githubWrite = workItemExists ? github.updateFeatureFile : github.createFeatureFile;

  try {
    await githubWrite(issueKey, data);

    if (workItemExists) {
      workItem.updateWorkItem(issueKey);
    } else {
      const data = {
        issueKey,
        created: Date.now(),
        externalPath: github.featureFilePath(issueKey)
      };

      workItem.createWorkItem(issueKey, data);
    }

    res.send({ key: 'value' });
  } catch(e) {
    if (e instanceof ClientError) {
      res.sendStatus(e.response.status, e.message);
    } else if (e instanceof ServerError) {
      res.sendStatus(502, 'Proxied Connection Error');
    } else {
      console.error(e);
      res.sendStatus(500, 'Internal Server Error');
    }
  }
});

module.exports = router;
