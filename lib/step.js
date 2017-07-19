const mongoose = require('mongoose');
const escapeStringRegexp = require('escape-string-regexp');

const Schema = mongoose.Schema;
const stepSchema = new Schema({
  origin: { type: String, require: true },
  issueKey:  { type: String, required: true },
  text: { type: String, required: true },
  normalizedText: { type: String, required: true }, // allows us to perform more optimized case sensitive regex filters
  created: { type: Date, default: Date.now },
  updated: { type: Date, required: true },
  hash: { type: String, required: true, unique: true }
});

stepSchema.index({ origin: 1, hash: 1 }, { unique: true });
stepSchema.index({ normalizedText: 1 });

const Step = mongoose.model('Step', stepSchema);

exports.exists = (origin, issueKey) => Step.find({ origin, issueKey }).count()

exports.upsertSteps = (origin, steps) => {
  return Promise.all(steps.map((step) => {
    const { hash } = step;
    const filter = { origin, hash };
    const options = { upsert: true, setDefaultsOnInsert: true };

    return Step.findOneAndUpdate(filter, step, options);
  }));
};

exports.search = (origin, q) => {
  const normalizedQuery = q.toLowerCase();
  const normalizedText = { $regex: `^${escapeStringRegexp(normalizedQuery)}` };

  return Step.find({ origin, normalizedText }).select({ text: 1 }).limit(10);
};
