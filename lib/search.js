const options = {
  indexPath: 'gherkin',
  stopwords: [], // looking for exact match within feature files
  logLevel: 'error'
};

const SearchIndex = require('search-index')
let index;

SearchIndex(options, (error, initializedIndex) => {
  if (!error) {
    index = initializedIndex;
  }
});

exports.upsertDocument = (doc) => {

};
