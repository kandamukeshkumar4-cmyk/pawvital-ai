import React from "react";
import { getSelfCheckGuide, type SelfCheckGuide as SelfCheckGuideType } from "@/lib/clinical/self-check-guides";

interface SelfCheckGuideProps {
  guideKey: string;
  onComplete?: () => void;
}

export const SelfCheckGuide: React.FC<SelfCheckGuideProps> = ({ guideKey, onComplete }) => {
  const guide: SelfCheckGuideType | null = getSelfCheckGuide(guideKey) ?? null;

  if (!guide) {
    return <div className="text-sm text-gray-500">Guide not available</div>;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-blue-900">{guide.title}</h3>

      <div>
        <h4 className="text-sm font-medium text-blue-800 mb-1">Steps:</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
          {guide.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="bg-green-50 p-2 rounded">
          <span className="font-medium text-green-800">Normal:</span>
          <p className="text-green-700 mt-1">{guide.normalAppearance}</p>
        </div>
        <div className="bg-red-50 p-2 rounded">
          <span className="font-medium text-red-800">Concerning:</span>
          <p className="text-red-700 mt-1">{guide.concerningAppearance}</p>
        </div>
      </div>

      <div className="text-xs text-gray-600 italic">{guide.cantAssessFallback}</div>

      {onComplete && (
        <button
          onClick={onComplete}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          I&apos;ve completed this check
        </button>
      )}
    </div>
  );
};

export default SelfCheckGuide;
