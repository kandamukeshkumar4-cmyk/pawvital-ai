"use client";

import type { AdminFeedbackLedgerDashboardData } from "@/lib/admin-feedback-ledger";
import type {
  TesterFeedbackAskedQuestion,
  TesterFeedbackCaseSummary,
} from "@/lib/tester-feedback-contract";

interface TesterFeedbackReviewPanelProps {
  initialData: AdminFeedbackLedgerDashboardData;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortId(value: string | null) {
  if (!value) return "n/a";
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

function formatAnswerValue(value: string | boolean | number) {
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

function CaseBadges({ entry }: { entry: TesterFeedbackCaseSummary }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {entry.urgencyResult}
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {entry.feedbackStatus}
      </span>
      {entry.flagReasons.map((flag) => (
        <span
          key={`${entry.symptomCheckId}-${flag}`}
          className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700"
        >
          {flag}
        </span>
      ))}
    </div>
  );
}

function QuestionList({
  questionsAsked,
}: {
  questionsAsked: TesterFeedbackAskedQuestion[];
}) {
  if (questionsAsked.length === 0) {
    return <p className="text-sm text-slate-500">No question ledger captured.</p>;
  }

  return (
    <ul className="space-y-1 text-sm text-slate-700">
      {questionsAsked.map((question) => (
        <li key={question.id}>
          <span className="font-medium">{question.id}</span>: {question.prompt}
        </li>
      ))}
    </ul>
  );
}

function AnswerList({
  answersGiven,
}: {
  answersGiven: TesterFeedbackCaseSummary["answersGiven"];
}) {
  const entries = Object.entries(answersGiven);
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No structured answers captured.</p>;
  }

  return (
    <ul className="space-y-1 text-sm text-slate-700">
      {entries.map(([key, value]) => (
        <li key={key}>
          <span className="font-medium">{key}</span>: {formatAnswerValue(value)}
        </li>
      ))}
    </ul>
  );
}

function CaseCard({ entry }: { entry: TesterFeedbackCaseSummary }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              {entry.reportTitle || entry.symptomInput}
            </h4>
            <p className="mt-1 text-sm text-slate-600">{entry.symptomInput}</p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Case: {shortId(entry.symptomCheckId)}</span>
            <span>Report: {shortId(entry.reportId)}</span>
            <span>Pet: {shortId(entry.petId)}</span>
            <span>User: {shortId(entry.testerUserId)}</span>
            <span>{formatWhen(entry.createdAt)}</span>
          </div>

          <CaseBadges entry={entry} />

          {(entry.helpfulness || entry.trustLevel || entry.confusingAreas.length > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              {entry.helpfulness ? <span>Helpful: {entry.helpfulness}</span> : null}
              {entry.trustLevel ? <span>Trust: {entry.trustLevel}</span> : null}
              {entry.confusingAreas.length > 0 ? (
                <span>Confusing: {entry.confusingAreas.join(", ")}</span>
              ) : null}
            </div>
          )}

          {entry.notes ? (
            <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
              {entry.notes}
            </p>
          ) : null}
        </div>

        <div className="grid min-w-[180px] grid-cols-2 gap-3 text-sm lg:grid-cols-1">
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Questions
            </p>
            <p className="mt-1 font-semibold text-slate-900">{entry.questionCount}</p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Answers
            </p>
            <p className="mt-1 font-semibold text-slate-900">{entry.answerCount}</p>
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          Case ledger details
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
              Questions asked
            </p>
            <QuestionList questionsAsked={entry.questionsAsked} />
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
              Answers given
            </p>
            <AnswerList answersGiven={entry.answersGiven} />
          </div>
        </div>
      </details>
    </article>
  );
}

function Section({
  entries,
  emptyCopy,
  title,
}: {
  entries: TesterFeedbackCaseSummary[];
  emptyCopy: string;
  title: string;
}) {
  return (
    <section className="rounded-lg bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium text-slate-900">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyCopy}</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <CaseCard key={`${title}-${entry.symptomCheckId}`} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

export function TesterFeedbackReviewPanel({
  initialData,
}: TesterFeedbackReviewPanelProps) {
  const stats = [
    { label: "Total cases", value: initialData.summary.totalCases },
    { label: "Feedback submitted", value: initialData.summary.feedbackSubmittedCases },
    { label: "Flagged cases", value: initialData.summary.flaggedCases },
    { label: "No feedback", value: initialData.summary.noFeedbackCases },
    { label: "Emergency cases", value: initialData.summary.emergencyCases },
    { label: "Report failures", value: initialData.summary.reportFailureCases },
  ];

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Founder Feedback Review
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Lightweight case ledger for private testers with quick buckets for
              latest, emergency, negative, missing-feedback, and report-failure cases.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Section
        title="Latest Cases"
        entries={initialData.latestCases}
        emptyCopy="No tester-linked cases were found yet."
      />
      <Section
        title="Emergency Cases"
        entries={initialData.emergencyCases}
        emptyCopy="No emergency cases are currently in the ledger."
      />
      <Section
        title="Negative Feedback"
        entries={initialData.negativeFeedbackCases}
        emptyCopy="No negative-feedback cases are currently flagged."
      />
      <Section
        title="No-Feedback Cases"
        entries={initialData.noFeedbackCases}
        emptyCopy="Every recent case has feedback right now."
      />
      <Section
        title="Report Failures"
        entries={initialData.reportFailureCases}
        emptyCopy="No report-failure cases are currently flagged."
      />
    </div>
  );
}
