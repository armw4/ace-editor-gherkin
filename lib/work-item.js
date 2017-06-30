const db = require('./db');

exports.createWorkItem = (issueKey, workItem) => db.set(issueKey, workItem).write()

exports.getWorkItem = (issueKey) => db.get(issueKey).value()

exports.doesWorkItemExist = (issueKey) => db.has(issueKey).value()

exports.updateWorkItem = (issueKey) => db.get(issueKey).assign({ updated: Date.now() })
