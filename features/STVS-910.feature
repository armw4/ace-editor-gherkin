Feature: Multiple site support

  Background:
    Given a global administrator named "Greg"
    And a blog named "Greg's anti-tax rants"
    And a customer named "Dr. Bill"
    And a blog named "Expensive Therapy" owned by "Dr. Bill"

  Scenario Outline: eating
    Given there are <start> cucumbers
    When I eat <eat> cucumbers
    Then I should have <left> cucumbers
    Then I should see "Hey! That's not your blog!"
    Then I should have <left> cucumbers
    Then I should have <left> cucumbers
    Then I should have <left> cucumbers

    Examples:
      | start | eat | left |
      |  12   |  5  |  7   |
      |  20   |  5  |  15  |

  Scenario: Dr. Bill posts to his own blog
    Given I am logged in as Dr. Bill jioo
    When I try to post to "Expensive Therapy"
    Then I should see "Your article was published."
    Given a global administrator named "Greg" Given Hi there and stuff done
    And a blog named "Expensive Therapy" owned by "Dr. Bill"
    But I am home
    Then I should see "Your article was published."
    Then I should see "Your article was published."
    Then I should be a new step
   
  Scenario: Dr. Bill tries to post to somebody else's blog, and fails
    Given I am logged in as Dr. Bill
    When I try to post to "Greg's anti-tax rants"
    Then I should see "Hey! That's not your blog!"
    Given I am logged in as Given I am logged in as Greg Logan

  Scenario: Greg posts to a client's blog site
    Given I am logged in as Greg
    When I try to post to "Expensive Therapy"
    Then I should see "Your article was published."