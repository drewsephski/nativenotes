import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContentDiff } from "../content-diff";

afterEach(cleanup);
describe("ContentDiff", () => {
  it("keeps distant changes separate and preserves context", () => {
    const middle = Array.from({ length: 20 }, (_, i) => `context ${i}`).join(
      "\n",
    );
    render(
      <ContentDiff
        label="Content"
        before={`old start\n${middle}\nold end\n`}
        after={`new start\n${middle}\nnew end\n`}
      />,
    );
    expect(screen.getByText("− old start")).toBeInTheDocument();
    expect(screen.getByText("+ new start")).toBeInTheDocument();
    expect(screen.getByText("− old end")).toBeInTheDocument();
    expect(screen.getByText("+ new end")).toBeInTheDocument();
    expect(screen.getByText("… 16 unchanged lines")).toBeInTheDocument();
    expect(screen.getByText("context 0")).toBeInTheDocument();
    expect(screen.queryByText("− context 0")).not.toBeInTheDocument();
  });
  it("shows final newline changes", () => {
    render(<ContentDiff label="Content" before="same" after={"same\n"} />);
    expect(screen.getByText("(no final newline)")).toBeInTheDocument();
  });
});
