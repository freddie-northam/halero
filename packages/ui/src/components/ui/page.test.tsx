// PageHeader is a shared foundation primitive, so it earns a small test: it
// must render the title, render the description only when given one, expose the
// data-slot the layout guard test keys on, and place actions in a slot.

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../test/happy-dom";
import { PageHeader } from "./page";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

test("renders the title as the page heading with the guard's data-slot", () => {
  const view = render(<PageHeader title="Calendar" />);
  const heading = view.getByRole("heading", { level: 1, name: "Calendar" });
  expect(heading).toBeTruthy();
  expect(
    view.container.querySelector('[data-slot="page-header"]'),
  ).toBeTruthy();
});

test("renders the description only when provided", () => {
  const withDesc = render(
    <PageHeader title="Progress" description="Your activity across sources." />,
  );
  expect(withDesc.getByText("Your activity across sources.")).toBeTruthy();
  cleanup();

  const withoutDesc = render(<PageHeader title="Tasks" />);
  expect(withoutDesc.queryByText("Your activity across sources.")).toBeNull();
});

test("places actions passed as children into the header", () => {
  const view = render(
    <PageHeader title="Notes">
      <button type="button">New note</button>
    </PageHeader>,
  );
  expect(view.getByRole("button", { name: "New note" })).toBeTruthy();
});
