"SUnit design: Pretty standard. TestCases subclasses contain methods, we call
all the ones that start with 'test'.

There are *three* possible outcomes from each test method:
- pass
- fail (assertions failed)
- error (errors signaled during the test run)
"

Object subclass: #TestCase
  instanceVariableNames: 'tests'.
  "A Dictionary of test method names and their TestResults."

TestCase >> ! setUp
  "Do nothing. Override to run before each test method."
!.
TestCase >> ! tearDown
  "Do nothing. Override to run after each test method."
!.


"Test assertions."
TestCase >> ! assert: aBoolean
  aBoolean ifTrue: [ self pass ] ifFalse: [ self fail ]
!.

TestCase >> ! deny: aBoolean
  aBoolean ifTrue: [ self fail ] ifFalse: [ self pass ]
!.

TestCase >> ! run
  | result |
  result := TestResult new.
  self run: result.
  ^ result
!.

TestCase >> ! run: aResult
  aResult runCase: self
!.

TestCase >> ! runCase
  [ self setUp. self performTest ] ensure: [ self tearDown ]
!.


TestCase class >> ! buildSuiteFromSelectors
  "Returns a TestSuite containing all the test methods defined on my class."
  | suite |
  suite := TestSuite new.
  self testSelectors do: [ :each | suite addTest: each ].
  ^ suite
!.


TestCase class >> ! testSelectors
  ^ self selectors asArray sorted select: [ :each |
    (each startsWith: 'test') and: [ each numArgs = 0 ]]
!.


TestCase class >> ! run
  ^ self buildSuiteFromSelectors run
!.


Object subclass: #TestResult
  instanceVariableNames: 'passed failed errors'.

TestResult >> initialize
  super initialize.
  passed := Array new.
  failed := Array new.
  errors := Array new
!.

TestResult >> runCase: aTestCase
  | tcPassed |
  tcPassed := true.
  [ [aTestCase runCase]
    on: self class failure
    do: [ :signal |
      failures add: aTestCase.
      tcPassed := false.
      signal return: false]]
        on: self class error
        do: [:signal |
          errors add: aTestCase.
          tcPassed := false.
          signal return: false].
  tcPassed ifTrue: [ passed add: aTestCase ]
!.



Object subclass: #TestSuite
  instanceVariableNames: 'tests'.

TestSuite >> initialize
  super initialize.
  tests := Array new
!.

TestSuite >> tests
  ^ tests
!.

TestSuite >> addTest: aTestCase
  tests add: aTestCase
!.

TestSuite >> run
  | result |
  result := TestResult new.
  [self run: result] ensure: [ nil ].
  ^ result
!.

TestSuite >> run: aResult
  self tests do: [ :each |
    "self changed: each.   TODO: What is this for?"
    each run: aResult ]
!.
