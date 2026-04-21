"use client";

import React, { useState } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Server, Database, CheckCircle, AlertCircle, X, FileAudio } from "lucide-react";
import type { AdminFeedbackLedgerDashboardData } from "@/lib/admin-feedback-ledger";
import type { AdminShadowRolloutDashboardData } from "@/lib/admin-shadow-rollout";
import type { ThresholdProposalDashboardData } from "@/lib/admin-threshold-proposals";
import { ShadowRolloutControlPanel } from "@/components/admin/shadow-rollout-control-panel";
import { TesterFeedbackReviewPanel } from "@/components/admin/tester-feedback-review-panel";
import { ThresholdProposalPanel } from "@/components/admin/threshold-proposal-panel";

interface AdminDashboardProps {
  initialStats: {
    checks_24h?: number;
    checks_7d?: number;
    checks_30d?: number;
    outcomes_confirmed?: number;
    knowledge_chunks?: number;
    audio_assets?: number;
    [key: string]: number | undefined;
  };
  initialDeployment: {
    state?: string;
    created_at?: string;
    url?: string;
    commit_sha?: string;
    [key: string]: string | undefined;
  };
  initialShadowRollout: AdminShadowRolloutDashboardData;
  initialTesterFeedbackReview: AdminFeedbackLedgerDashboardData;
  initialThresholdProposals: ThresholdProposalDashboardData;
}

export default function AdminDashboardClient({
  initialStats,
  initialDeployment,
  initialShadowRollout,
  initialTesterFeedbackReview,
  initialThresholdProposals,
}: AdminDashboardProps) {
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueLabels, setIssueLabels] = useState("bug, triage");
  const [issueStatus, setIssueStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [issueUrl, setIssueUrl] = useState("");

  const submitIssue = async () => {
    setIssueStatus("submitting");
    try {
      const res = await fetch("/api/admin/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: issueLabels.split(",").map(s => s.trim())
        })
      });

      if (!res.ok) throw new Error("Failed to create issue");
      const data = await res.json();
      setIssueUrl(data.url);
      setIssueStatus("success");
    } catch {
      setIssueStatus("error");
    }
  };

  // Sparkline mock data for Active checks - from oldest to newest for linear graphing
  const sparklineData = [
    { name: "30d", value: initialStats.checks_30d },
    { name: "7d", value: initialStats.checks_7d },
    { name: "24h", value: initialStats.checks_24h }
  ];

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => {
            setIssueStatus("idle");
            setIssueModalOpen(true);
          }}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          <AlertCircle className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          File Issue
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Supabase Stats */}
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Database className="h-6 w-6 text-gray-400" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Knowledge Chunks</dt>
                  <dd className="text-lg font-medium text-gray-900">{initialStats.knowledge_chunks}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileAudio className="h-6 w-6 text-blue-400" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Audio Assets</dt>
                  <dd className="text-lg font-medium text-gray-900">{initialStats.audio_assets}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-500" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Confirmed Outcomes</dt>
                  <dd className="text-lg font-medium text-gray-900">{initialStats.outcomes_confirmed}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Vercel Deployment */}
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Server className="h-6 w-6 text-gray-400" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Latest Deployment</dt>
                  <dd className="mt-1 flex items-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        initialDeployment.state === "READY"
                          ? "bg-green-100 text-green-800"
                          : initialDeployment.state === "ERROR"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {initialDeployment.state}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">
                      {initialDeployment.commit_sha?.substring(0, 7)}
                    </span>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white overflow-hidden shadow rounded-lg p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Active Checks (Trend)</h3>
        <div className="h-64">
           <ResponsiveContainer width="100%" height="100%">
             <LineChart data={sparklineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
               <CartesianGrid strokeDasharray="3 3" />
               <XAxis dataKey="name" />
               <YAxis />
               <Tooltip />
               <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} activeDot={{ r: 8 }} />
             </LineChart>
           </ResponsiveContainer>
        </div>
        <div className="mt-4 flex justify-between text-sm text-gray-500 border-t pt-4 border-gray-200">
           <span>Total for last 30 Days: <span className="font-semibold">{initialStats.checks_30d}</span></span>
           <span>Last 7 Days: <span className="font-semibold">{initialStats.checks_7d}</span></span>
           <span>Last 24 Hours: <span className="font-semibold">{initialStats.checks_24h}</span></span>
        </div>
      </div>

      {issueModalOpen && (
        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIssueModalOpen(false)} />
            
            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
              <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                <button
                  type="button"
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => setIssueModalOpen(false)}
                >
                  <span className="sr-only">Close</span>
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                  <h3 className="text-base font-semibold leading-6 text-gray-900">File a GitHub Issue</h3>
                  <div className="mt-4">
                    {issueStatus === "success" ? (
                       <div className="bg-green-50 p-4 rounded-md">
                         <p className="text-green-700">Issue created successfully!</p>
                         <a href={issueUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline text-sm mt-2 block">
                           View Issue: {issueUrl}
                         </a>
                       </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium leading-6 text-gray-900">Title</label>
                          <input
                            type="text"
                            value={issueTitle}
                            onChange={(e) => setIssueTitle(e.target.value)}
                            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 px-3 sm:text-sm sm:leading-6"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium leading-6 text-gray-900">Body</label>
                          <textarea
                            rows={4}
                            value={issueBody}
                            onChange={(e) => setIssueBody(e.target.value)}
                            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 px-3 sm:text-sm sm:leading-6"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium leading-6 text-gray-900">Labels (comma separated)</label>
                          <input
                            type="text"
                            value={issueLabels}
                            onChange={(e) => setIssueLabels(e.target.value)}
                            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 px-3 sm:text-sm sm:leading-6"
                          />
                        </div>
                        {issueStatus === "error" && <p className="text-red-600 text-sm">Failed to create issue. Please check the console.</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                {issueStatus !== "success" && (
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:ml-3 sm:w-auto"
                    onClick={submitIssue}
                    disabled={issueStatus === "submitting"}
                  >
                    {issueStatus === "submitting" ? "Submitting..." : "Submit Issue"}
                  </button>
                )}
                <button
                  type="button"
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                  onClick={() => setIssueModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ShadowRolloutControlPanel initialData={initialShadowRollout} />
      <TesterFeedbackReviewPanel initialData={initialTesterFeedbackReview} />
      <ThresholdProposalPanel initialData={initialThresholdProposals} />
    </div>
  );
}
