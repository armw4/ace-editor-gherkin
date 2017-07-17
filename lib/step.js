const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const stepSchema = new Schema({
  organizationId: { type: String, require: true },
  issueKey:  { type: String, required: true },
  text: { type: String, required: true },
  normalizedText: { type: String, required: true }, // allows us to perform more optimized case sensitive regex filters
  created: { type: Date, default: Date.now },
  updated: { type: Date, required: true },
  hash: { type: String, required: true, unique: true }
});

stepSchema.index({ organizationId: 1, hash: 1 }, { unique: true });
stepSchema.index({ normalizedText: 1 });

const Step = mongoose.model('Step', stepSchema);

exports.exists = (issueKey, organizationId) => Step.find({ issueKey, organizationId }).count()

exports.upsertSteps = (organizationId, steps) => {
  return Promise.all(steps.map((step) => {
    const { hash } = step;

    return Step.findOneAndUpdate({ organizationId, hash }, step, { upsert: true, setDefaultsOnInsert: true });
  }));
};
