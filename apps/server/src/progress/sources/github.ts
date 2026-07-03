// GitHub activity source: the user's contribution counts, pulled with the
// PAT stored by the connection framework. Remote + apiKey, but it conforms
// to the same ActivitySource contract as the local sources.

import { addDaysToDateString } from "@halero/connector-sdk";
import { readConnectionToken } from "../../connections/connection-token";
import { fetchContributions } from "../github";
import type {
  ActivitySource,
  ActivitySourceContext,
  ActivitySourceData,
} from "../source";

export const GITHUB_SOURCE_ID = "github";

export const githubSource: ActivitySource = {
  id: GITHUB_SOURCE_ID,
  async readDaily(
    ctx: ActivitySourceContext,
  ): Promise<ActivitySourceData | null> {
    const token = readConnectionToken(ctx.db, ctx.key, GITHUB_SOURCE_ID);
    if (token === null) {
      return null;
    }
    // contributionsCollection accepts at most a one-year window.
    const from = `${addDaysToDateString(ctx.today, -365)}T00:00:00Z`;
    const to = `${ctx.today}T23:59:59Z`;
    const contributions = await fetchContributions(ctx.fetch, token, from, to);
    return {
      accountLabel: contributions.login,
      total: contributions.total,
      days: contributions.days,
    };
  },
};
