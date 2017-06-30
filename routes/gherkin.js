const express = require('express');
const router = express.Router();
const cucumber = require('cucumber');
const github = require('../lib/github');
const workItem = require('../lib/work-item');
const ClientError = require('../lib/errors').ClientError;
const ServerError = require('../lib/errors').ServerError;
const handleError = require('../lib/errors').handleError;
const camelize = require('camelize');

router.get('/:issueKey', async (req, res) => {
  const { issueKey } = req.params;

  if (!workItem.exists(issueKey)) {
    return res.sendStatus(404, 'Not Found');
  }

  const item = workItem.getWorkItem(issueKey);

  try {
    const featureFile = await github.getFeatureFile(issueKey);
    const consolidatedResource = camelize({
      ...item,
      ...featureFile
    });

    res.send(consolidatedResource);
  } catch(e) {
    handleError(res, e);
  }
});

router.put('/:issueKey', async (req, res) => {
  const { issueKey } = req.params;
  const workItemExists = workItem.exists(issueKey);
  const githubWrite = workItemExists ? github.updateFeatureFile : github.createFeatureFile;

  try {
    await githubWrite(issueKey, {
      content: req.body.content
    });

    if (workItemExists) {
      workItem.updateWorkItem(issueKey);
    } else {
      workItem.createWorkItem(issueKey, {
        issueKey,
        created: Date.now(),
        externalPath: github.featureFilePath(issueKey)
      });
    }

    res.send({ key: 'value' });
  } catch(e) {
    handleError(res, e);
  }
});

module.exports = router;
