import { afterAll, afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { act } from "react";
import type { Task } from "../../contract";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";

registerHappyDom();

const { TaskDetailDialog } = await import("./task-detail-dialog");

afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const task: Task = {
  entityId: "task-42",
  title: "Ship the thing",
  status: "todo",
  priority: null,
  tags: [],
  dueDate: null,
  notes: null,
  estimateMinutes: null,
  loggedMinutes: 0,
  sortOrder: 1,
  completedAt: null,
};

const noop = async (): Promise<void> => undefined;

test("renders the host-provided related slot for the open task", async () => {
  act(() => {
    render(
      <TaskDetailDialog
        task={task}
        onClose={() => undefined}
        onSave={noop}
        onDelete={noop}
        onLogTime={noop}
        renderRelated={(entityId) => (
          <div data-testid="related">related for {entityId}</div>
        )}
      />,
    );
  });

  await waitFor(() => {
    expect(document.body.textContent).toContain("related for task-42");
  });
});
