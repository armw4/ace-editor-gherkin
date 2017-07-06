const express = require('express');
const router = express.Router();
const github = require('../lib/github');
const workItem = require('../lib/work-item');
const ClientError = require('../lib/errors').ClientError;
const ServerError = require('../lib/errors').ServerError;
const handleError = require('../lib/errors').handleError;
const gherkin = require('../lib/gherkin');
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
  const { content } = req.body;

  try {
    const { feature } = gherkin.parse(content);

    await githubWrite(issueKey, {
      content
    });

    if (workItemExists) {
      workItem.updateWorkItem(issueKey, {
        feature
      });
    } else {
      workItem.createWorkItem(issueKey, {
        issueKey,
        created: Date.now(),
        externalPath: github.featureFilePath(issueKey),
        feature
      });
    }

    res.send({ key: 'value' });
  } catch(e) {
    handleError(res, e);
  }
});

module.exports = router;
