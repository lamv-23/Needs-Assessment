'use client';

import CopyTextButton from '@/components/needs/CopyTextButton';
import { narrativeToPlainText, type NarrativeSection } from '@/lib/needs/narrative';
import { citationSegments, NEEDS_SOURCES, sourceNumber } from '@/lib/needs/page-data';

/** The id of the sources-list entry a citation links to. */
export const sourceAnchor = (number: number) => `source-${number}`;

function CitationLink({ number }: { number: number }) {
  return (
    <a href={`#${sourceAnchor(number)}`} title={NEEDS_SOURCES[number - 1]?.short} className="text-primary-700 hover:underline">
      {number}
    </a>
  );
}

/**
 * One narrative section: its heading and paragraphs, each followed by superscript citation numbers that
 * link to the sources list, and a button that copies the section as plain text (no citations).
 */
export default function NarrativeBlock({ section }: { section: NarrativeSection }) {
  return (
    <section id={`section-${section.id}`} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{section.heading}</h2>
        <CopyTextButton text={narrativeToPlainText([section])} label="Copy text" />
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-gray-800">
        {section.paragraphs.map((paragraph, i) => (
          <p key={i}>
            {paragraph.text}
            {paragraph.citations.length > 0 && (
              <sup className="ml-0.5 text-xs">
                {citationSegments(paragraph.citations.map(sourceNumber)).map(({ from, to }, n) => (
                  <span key={from}>
                    {n > 0 && ', '}
                    <CitationLink number={from} />
                    {to !== from && (
                      <>
                        {'–'}
                        <CitationLink number={to} />
                      </>
                    )}
                  </span>
                ))}
              </sup>
            )}
          </p>
        ))}
      </div>
    </section>
  );
}
