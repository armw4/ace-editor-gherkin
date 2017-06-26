const express = require('express')
const router = express.Router()
const cucumber = require('cucumber')
const fetch = require('isomorphic-fetch')

/* GET gherkin listing. */
router.get('/:issueKey', function(req, res, next) {
  res.send('respond with a resource');
});

// create new
router.put('/:issueKey', (req, res) => {
  console.log(req.body)
  res.send({ key: 'value' })
})

// update existing
router.post('/:issueKey', (req, res) => {
  console.log(req.body)
  res.sendStatus(200)
})

module.exports = router;
