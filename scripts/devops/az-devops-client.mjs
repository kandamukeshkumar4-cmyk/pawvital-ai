#!/usr/bin/env node
/**
 * Azure DevOps API client for AI agents.
 *
 * Any agent (Claude, Cursor, Codex, Copilot, Antigravity) can use this
 * to interact with Azure DevOps: trigger pipelines, create work items,
 * comment on PRs, check build status.
 *
 * Usage:
 *   node scripts/devops/az-devops-client.mjs <command> [args]
 *
 * Required env:
 *   AZURE_DEVOPS_PAT   — Personal Access Token (scope: Code, Build, Work Items)
 *   AZURE_DEVOPS_ORG   — Organization name (e.g. "pawvital")
 *   AZURE_DEVOPS_PROJECT — Project name (e.g. "PawVital")
 *
 * Commands:
 *   build-status <buildId>          — Get status of a pipeline run
 *   trigger-pipeline <pipelineId>  — Queue a new pipeline run
 *   create-work-item <type> <title> — Create a Board work item (Bug, Task, etc.)
 *   pr-comment <prId> <message>    — Comment on a pull request
 *   list-prs                        — List open PRs
 */

import { execSync } from "node:child_process";

const ORG = process.env.AZURE_DEVOPS_ORG;
const PROJECT = process.env.AZURE_DEVOPS_PROJECT;
const PAT = process.env.AZURE_DEVOPS_PAT;

if (!ORG || !PROJECT || !PAT) {
  console.error(
    "Missing required env vars: AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT"
  );
  process.exit(1);
}

const BASE_URL = `https://dev.azure.com/${ORG}/${PROJECT}`;
const AUTH = Buffer.from(`:${PAT}`).toString("base64");

async function azureRequest(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${AUTH}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Azure DevOps API error ${resp.status}: ${body}`);
  }

  return resp.json();
}

const commands = {
  /** Get status of a pipeline build */
  async "build-status"([buildId]) {
    if (!buildId) throw new Error("Usage: build-status <buildId>");
    const data = await azureRequest(
      `${BASE_URL}/_apis/build/builds/${buildId}?api-version=7.1`
    );
    console.log(
      JSON.stringify(
        {
          id: data.id,
          status: data.status,
          result: data.result,
          pipeline: data.definition?.name,
          branch: data.sourceBranch,
          url: data._links?.web?.href,
          startTime: data.startTime,
          finishTime: data.finishTime,
        },
        null,
        2
      )
    );
  },

  /** Queue a new pipeline run */
  async "trigger-pipeline"([pipelineId, branch = "master"]) {
    if (!pipelineId) throw new Error("Usage: trigger-pipeline <pipelineId> [branch]");
    const data = await azureRequest(
      `${BASE_URL}/_apis/pipelines/${pipelineId}/runs?api-version=7.1`,
      {
        method: "POST",
        body: JSON.stringify({
          resources: {
            repositories: {
              self: { refName: `refs/heads/${branch}` },
            },
          },
        }),
      }
    );
    console.log(`Triggered pipeline run #${data.id} on ${branch}`);
    console.log(`URL: ${data._links?.web?.href}`);
  },

  /** Create a work item on the Azure Board */
  async "create-work-item"([type = "Task", ...titleParts]) {
    const title = titleParts.join(" ");
    if (!title) throw new Error("Usage: create-work-item <type> <title>");
    const data = await azureRequest(
      `${BASE_URL}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json-patch+json" },
        body: JSON.stringify([{ op: "add", path: "/fields/System.Title", value: title }]),
      }
    );
    console.log(`Created ${type} #${data.id}: ${title}`);
    console.log(`URL: ${data._links?.html?.href}`);
  },

  /** Comment on a GitHub PR from Azure DevOps context */
  async "pr-comment"([prId, ...messageParts]) {
    const message = messageParts.join(" ");
    if (!prId || !message) throw new Error("Usage: pr-comment <prId> <message>");

    // Use gh CLI to post the comment (GitHub PAT needed in env)
    const ghToken = process.env.GITHUB_PAT || process.env.GH_TOKEN;
    if (!ghToken) throw new Error("GITHUB_PAT or GH_TOKEN required for pr-comment");

    execSync(`gh pr comment ${prId} --body "${message.replace(/"/g, '\\"')}"`, {
      env: { ...process.env, GH_TOKEN: ghToken },
      stdio: "inherit",
    });
  },

  /** List open PRs */
  async "list-prs"() {
    // Use gh CLI for GitHub PRs
    const ghToken = process.env.GITHUB_PAT || process.env.GH_TOKEN;
    if (!ghToken) throw new Error("GITHUB_PAT or GH_TOKEN required for list-prs");

    execSync("gh pr list --state open --json number,title,headRefName,author", {
      env: { ...process.env, GH_TOKEN: ghToken },
      stdio: "inherit",
    });
  },
};

// Main
const [, , command, ...args] = process.argv;

if (!command || !commands[command]) {
  console.error(`Unknown command: ${command || "(none)"}`);
  console.error(`Available: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

commands[command](args).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
