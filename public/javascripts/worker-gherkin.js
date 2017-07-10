define(function(require, exports, module) {
  "use strict";

  var oop = require('ace/lib/oop');
  var Mirror = require('ace/worker/mirror').Mirror;
  var lint = new Gherkin.Parser();

  lint.stopAtFirstError = false;

  var GherkinWorker = exports.GherkinWorker = function(sender) {
    Mirror.call(this, sender);
    this.setTimeout(500);
    this.setOptions();
  };

  oop.inherits(GherkinWorker, Mirror);

  (function() {
    this.onUpdate = function() {
      var value = this.doc.getValue();

      try {
        lint(value);
      } catch(e) {
        var errors = e.errors.map(function(error) {
          return {
            row: error.location.line - 1, // must be 0 based
            column: error.location.column - 1,
            text: error.message,
            type: 'error'
          };
        });

        this.sender.emit('lint', errors);
      }
    };
  }).call(GherkinWorker.prototype);
});
