import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PolicyParagraph, PolicyQuestion, PolicyQuestions } from "@/components/shop/policy-page";

describe("policy questions", () => {
  test("renders expanded native disclosures with visible answers", () => {
    const markup = renderToStaticMarkup(
      <PolicyQuestions>
        <PolicyQuestion question="Do you charge sales tax?">
          <PolicyParagraph>We do not currently charge sales tax.</PolicyParagraph>
        </PolicyQuestion>
      </PolicyQuestions>,
    );

    expect(markup).toContain("<details");
    expect(markup).toContain(' open=""');
    expect(markup).toContain("<summary");
    expect(markup).toContain("Do you charge sales tax?");
    expect(markup).toContain("We do not currently charge sales tax.");
  });
});
