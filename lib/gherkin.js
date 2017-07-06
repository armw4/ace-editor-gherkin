const Gherkin = require('cucumber');
const parser = new Gherkin.Parser(new Gherkin.AstBuilder());
const matcher = new Gherkin.TokenMatcher();
const CompositeParserException = require('cucumber/lib/gherkin/errors').CompositeParserException;;

exports.parse = (gherkin) => {
  const scanner = new Gherkin.TokenScanner(gherkin);
  const ast = parser.parse(scanner, matcher);

  if (!ast.feature) {
    throw new CompositeParserException('Feature file must contain a feature.');
  }

  const { feature: { name, description, children } } = ast;
  const scenarioNodes = children.filter(({ type }) => type === 'Scenario');
  const scenarios = scenarioNodes.map((scenario) => {
    const { name, description, steps } = scenario;

    return {
      name,
      description,
      steps: steps.map((step) => {
        const { keyword, text } = step;

        return {
          keyword: keyword.trim(),
          text
        };
      });
    }
  });

  return {
    feature: {
      name,
      description,
      scenarios
    }
  };
};
