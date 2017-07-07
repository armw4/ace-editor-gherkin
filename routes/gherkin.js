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
  try {
    const { issueKey } = req.params;

    if (!workItem.exists(issueKey)) {
      return res.sendStatus(404, 'Not Found');
    }

    const item = workItem.getWorkItem(issueKey);
    const featureFile = await github.getFeatureFile(issueKey);
    const merge = Object.assign({}, item, featureFile);
    const consolidatedResource = camelize(merge);

    res.send(consolidatedResource);
  } catch(e) {
    handleError(res, e);
  }
});

router.put('/:issueKey', async (req, res) => {
  try {
    const { issueKey } = req.params;
    const { content } = req.body;
    const workItemExists = workItem.exists(issueKey);
    const githubWrite = workItemExists ? github.updateFeatureFile : github.createFeatureFile;
    const { feature } = gherkin.parse(content);
    const featureFile = await githubWrite(issueKey, {
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

    const item = workItem.getWorkItem(issueKey);
    const merge = Object.assign({}, item, featureFile);
    const consolidatedResource = camelize(merge);

    res.send(consolidatedResource);
  } catch(e) {
    handleError(res, e);
  }
});

module.exports = router;
