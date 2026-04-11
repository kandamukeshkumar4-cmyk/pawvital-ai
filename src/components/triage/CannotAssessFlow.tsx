import React from "react";

interface CannotAssessFlowProps {
  symptom: string;
  alternateQuestion?: string;
  onCannotAssess: () => void;
  onTryAgain: () => void;
}

export const CannotAssessFlow: React.FC<CannotAssessFlowProps> = ({
  symptom,
  alternateQuestion,
  onCannotAssess,
  onTryAgain,
}) => {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-yellow-900">Can&apos;t assess {symptom.replace(/_/g, " ")}?</h3>

      <p className="text-sm text-yellow-800">
        That&apos;s okay - not all signs are easy to check at home. We can proceed safely.
      </p>

      {alternateQuestion && (
        <div className="bg-white p-3 rounded border border-yellow-100">
          <p className="text-sm font-medium text-gray-800 mb-1">Alternative question:</p>
          <p className="text-sm text-gray-700">{alternateQuestion}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCannotAssess}
          className="flex-1 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition"
        >
          I can&apos;t assess this
        </button>
        <button
          onClick={onTryAgain}
          className="flex-1 bg-white border border-yellow-300 text-yellow-800 px-4 py-2 rounded hover:bg-yellow-50 transition"
        >
          I&apos;ll try again
        </button>
      </div>

      <p className="text-xs text-gray-600">
        If you&apos;re unsure, it&apos;s always safer to consult your veterinarian.
      </p>
    </div>
  );
};

export default CannotAssessFlow;
