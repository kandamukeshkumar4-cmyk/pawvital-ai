"use client";

import Image from "next/image";
import { ImagePlus } from "lucide-react";
import type { ReferenceImage } from "./types";
import { CollapsibleSection } from "./collapsible-section";

export function humanizeLabel(label: string): string {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ReferenceImagesSection({ images }: { images: ReferenceImage[] }) {
  if (!images.length) return null;

  return (
    <CollapsibleSection
      title="Reference Images"
      icon={ImagePlus}
      iconColor="text-pink-600"
      defaultOpen={false}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
        {images.map((ref, i) => {
          const pct = Math.round(
            Math.min(1, Math.max(0, ref.similarity)) * 100
          );
          return (
            <div
              key={`${ref.condition_label}-${i}`}
              className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm"
            >
              <div className="aspect-square bg-gray-100 flex flex-col items-center justify-center p-2">
                {ref.asset_url ? (
                  <Image
                    src={ref.asset_url}
                    alt={ref.condition_label}
                    width={320}
                    height={320}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <ImagePlus className="w-8 h-8 text-gray-300" />
                    <p className="text-[10px] text-gray-400 text-center mt-1 px-1">
                      Image available in clinical corpus
                    </p>
                  </>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900 px-3 pt-2">
                {humanizeLabel(ref.condition_label)}
              </p>
              <p className="text-xs text-gray-500 px-3">{pct}% match</p>
              {ref.caption && (
                <p className="text-xs text-gray-400 px-3 pb-3 line-clamp-2">
                  {ref.caption}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
