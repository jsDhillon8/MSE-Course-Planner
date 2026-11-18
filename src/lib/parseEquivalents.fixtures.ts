export const PARSE_EQUIVALENTS_FIXTURES: {
  input: string;
  expected: string[];
  selfCode?: string;
  /** Codes expected to be flagged `orderRuleOnly` ("taken X first may not then take"). */
  orderRuleOnly?: string[];
}[] = [
  {
    input: "PHYS 126 or 121 or 102",
    expected: ["PHYS 126", "PHYS 121", "PHYS 102"],
  },
  {
    input: "MATH 150, 154 or 157",
    expected: ["MATH 150", "MATH 154", "MATH 157"],
  },
  {
    input: "CMPT 120, MACM 101",
    expected: ["CMPT 120", "MACM 101"],
  },
  {
    input: "MATH 150/151",
    expected: ["MATH 150", "MATH 151"],
  },
  {
    input:
      "Students with credit for SEE 222, ENSC 231 or ENSC 330 may not take MSE 220 for further credit.",
    expected: ["SEE 222", "ENSC 231", "ENSC 330"],
    selfCode: "MSE 220",
  },
  {
    input: "Students who have taken ECON 103 first may not then take this course for further credit.",
    expected: ["ECON 103"],
    selfCode: "ECON 113",
    orderRuleOnly: ["ECON 103"],
  },
  {
    input:
      "Students with credit for CMPT 102, 120, 128 or 166 may not take this course for further credit. Students who have taken CMPT 125, 129 or 135 first may not then take this course for further credit.",
    expected: ["CMPT 102", "CMPT 120", "CMPT 128", "CMPT 166", "CMPT 125", "CMPT 129", "CMPT 135"],
    selfCode: "CMPT 130",
    orderRuleOnly: ["CMPT 125", "CMPT 129", "CMPT 135"],
  },
] ;
