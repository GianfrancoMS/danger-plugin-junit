import * as fs from "fs-extra";
import * as glob from "glob";
import { inspect, promisify } from "util";
import { DOMParser } from "@xmldom/xmldom";

// Provides dev-time type structures for  `danger` - doesn't affect runtime.
import { DangerDSLType } from "../node_modules/danger/distribution/dsl/DangerDSL";
declare var danger: DangerDSLType;
export declare function message(message: string): void;
export declare function warn(message: string): void;
export declare function fail(message: string): void;
export declare function markdown(message: string): void;

interface Attribute {
  nodeName: string;
}

interface Element {
  attributes: Attribute[];
  firstChild: Element;
  nodeValue: string;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string;
  getElementsByTagName(name: string): ElementList;
  hasChildNodes(): boolean;
}

interface ElementList {
  readonly length: number;
  item(index: number): Element;
  [index: number]: Element;
}

interface JUnitReportOptions {
  /**
   * The path to the generated junit files.
   */
  pathToReport?: string;
  /**
   * Message to show at the top of the test results table. Defaults to "Tests"
   */
  name?: string;

  /**
   * If there are test failures, call warn not fail
   */
  onlyWarn?: boolean;
}

/**
 * Add your Junit XML test failures to Danger
 */
export default async function junit(options: JUnitReportOptions) {
  const currentPath: string =
    options.pathToReport !== undefined
      ? options.pathToReport!
      : "./build/reports/**/TESTS*.xml";

  const name = options.name ? options.name : "Tests";

  // Use glob to find xml reports!
  const matches: string[] = await promisify(glob)(currentPath);
  if (matches.length === 0) {
    return;
  }

  // Gather all the suites up
  const allSuites = await Promise.all(matches.map((m) => gatherSuites(m)));
  const suites: globalThis.Element[] = allSuites.reduce(
    (acc, val) => acc.concat(val),
    []
  );

  // Give details on failed tests
  const failuresAndErrors: globalThis.Element[] = gatherFailedTestcases(suites);
  if (failuresAndErrors.length !== 0) {
    reportFailures(failuresAndErrors, name, options.onlyWarn);
  }
}

function reportFailures(
  failuresAndErrors: globalThis.Element[],
  name: string,
  onlyWarn?: boolean
): void {
  onlyWarn
    ? warn(`${name} have failed, see below for more information.`)
    : fail(`${name} have failed, see below for more information.`);
  let testResultsTable: string = `### ${name}: \n\n"`;

  testResultsTable += `| File | Name | Message | Type|\n`;

  failuresAndErrors.forEach((test) => {
    const file = test.getAttribute("classname");
    const name = test.getAttribute("name");
    const failures = test.getElementsByTagName("failure");
    let message = " - ";
    let type = " - ";
    if (failures.length !== 0) {
      const failure = failures[0];
      message = failure.getAttribute("message") ?? " - ";
      type = failure.getAttribute("type") ?? " - ";
    }
    testResultsTable += `| ${file} | ${name} | ${message} | ${type}|\n`;
  });
  markdown(testResultsTable);
}

async function gatherSuites(reportPath: string): Promise<globalThis.Element[]> {
  const exists = await fs.pathExists(reportPath);
  if (!exists) {
    return [];
  }
  const contents = await fs.readFile(reportPath, "utf8");
  const doc = new DOMParser().parseFromString(contents, "text/xml");
  const suiteRoot =
    doc.documentElement.firstChild?.nodeName === "testsuites"
      ? doc.documentElement.firstElementChild
      : doc.documentElement;
  return suiteRoot?.nodeName === "testsuite"
    ? [suiteRoot]
    : Array.from(suiteRoot?.getElementsByTagName("testsuite") || []);
}

// Report test failures
function gatherFailedTestcases(
  suites: globalThis.Element[]
): globalThis.Element[] {
  // We need to get the 'testcase' elements that have an 'error' or 'failure' child node
  const failedSuites = suites.filter((suite) => {
    const hasFailures =
      suite.hasAttribute("failures") &&
      parseInt(suite.getAttribute("failures")!, 10) !== 0;
    const hasErrors =
      suite.hasAttribute("errors") &&
      parseInt(suite.getAttribute("errors")!, 10) !== 0;
    return hasFailures || hasErrors;
  });
  // Gather all the testcase nodes from each failed suite properly.
  let failedSuitesAllTests: globalThis.Element[] = [];
  failedSuites.forEach((suite) => {
    failedSuitesAllTests = failedSuitesAllTests.concat(
      Array.from(suite.getElementsByTagName("testcase"))
    );
  });
  return failedSuitesAllTests.filter((test) => {
    return (
      test.hasChildNodes() &&
      (test.getElementsByTagName("failure").length > 0 ||
        test.getElementsByTagName("error").length > 0)
    );
  });
}
