const low = require('lowdb');
const db = low('db.json');

module.exports = db;
