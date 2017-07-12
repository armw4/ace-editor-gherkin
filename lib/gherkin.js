const Gherkin = require('gherkin');
const parser = new Gherkin.Parser(new Gherkin.AstBuilder());
const matcher = new Gherkin.TokenMatcher();
const CompositeParserException = require('gherkin/lib/gherkin/errors').CompositeParserException;;

const NULL_BACKGROUND = {
  steps: []
};

const mapSteps = (steps) => {
  return steps.map((step) => {
    const { keyword, text } = step;

    return {
      keyword: keyword.trim(),
      text: `${keyword.trim()} ${text}`
    };
  });
};

exports.parse = (gherkin) => {
  const scanner = new Gherkin.TokenScanner(gherkin);
  const ast = parser.parse(scanner, matcher);

  if (!ast.feature) {
    throw new CompositeParserException('Feature file must contain a feature.');
  }

  const { feature: { name, description, children } } = ast;
  const scenarioNodes = children.filter(({ type }) => type === 'Scenario' || type === 'ScenarioOutline');
  const backgroundNode = children.find(({ type }) => type === 'Background');

  const scenarios = scenarioNodes.map((scenario) => {
    const { name, description, steps } = scenario;

    return {
      name,
      description,
      steps: mapSteps(steps)
    }
  });

  return {
    feature: {
      name,
      description,
      background: backgroundNode ? { steps: mapSteps(backgroundNode.steps) } : NULL_BACKGROUND,
      scenarios
    }
  };
};
