const express = require('express')
const router = express.Router()
const cucumber = require('cucumber')

/* GET gherkin listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

router.post('/', (req, res) => {
  res.sendStatus
})

module.exports = router;
