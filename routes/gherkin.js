const express = require('express');
const router = express.Router();
const github = require('../lib/github');
const step = require('../lib/step');
const ClientError = require('../lib/errors').ClientError;
const ServerError = require('../lib/errors').ServerError;
const handleError = require('../lib/errors').handleError;
const gherkin = require('../lib/gherkin');
const camelize = require('camelize');

router.get('/steps', async(req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(422).send('q parameter required');
    }

    const results = await step.search(req.organizationId, q);

    res.send(results);
  } catch(e) {
    handleError(res, e);
  }
});

router.get('/:issueKey', async (req, res) => {
  try {
    const { issueKey } = req.params;
    const featureFile = await github.getFeatureFile(issueKey);

    res.send(camelize(featureFile));
  } catch(e) {
    handleError(res, e);
  }
});

router.put('/:issueKey', async (req, res) => {
  try {
    const { issueKey } = req.params;
    const { content } = req.body;
    const { organizationId } = req;
    const stepsExist = await step.exists(organizationId, issueKey);
    const githubWrite = stepsExist ? github.updateFeatureFile : github.createFeatureFile;
    const { feature } = gherkin.parse(content);
    const { background: { steps: backgroundSteps }, scenarios } = feature;
    const scenarioSteps = scenarios.map(({ steps }) => steps).reduce((acc, steps) => [...acc, ...steps], []);

    const allSteps = [...backgroundSteps, ...scenarioSteps].map((step) => {
      return Object.assign({}, step, { issueKey, updated: Date.now(), organizationId });
    });

    const featureFile = await githubWrite(issueKey, {
      content
    });

    await step.upsertSteps(organizationId, allSteps);

    res.send(camelize(featureFile));
  } catch(e) {
    handleError(res, e);
  }
});

module.exports = router;
