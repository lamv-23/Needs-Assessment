'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface PageNavSection {
  id: string;
  label: string;
}

interface PageNavProps {
  sections: PageNavSection[];
  className?: string;
}

export default function PageNav({ sections, className }: PageNavProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const section = entry.target.getAttribute('data-section') || entry.target.id;
            if (section) setActiveId(section);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    const els: Element[] = [];
    for (const section of sections) {
      // Look for elements with id or data-section matching
      const byId = document.getElementById(section.id);
      if (byId) {
        observer.observe(byId);
        els.push(byId);
      }
      const byData = document.querySelectorAll(`[data-section="${section.id}"]`);
      byData.forEach((el) => {
        observer.observe(el);
        els.push(el);
      });
    }

    return () => {
      for (const el of els) observer.unobserve(el);
    };
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id) || document.querySelector(`[data-section="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const wrapper = scrollRef.current;
      if (wrapper) {
        const btn = wrapper.querySelector(`[data-nav="${id}"]`);
        btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  };

  if (sections.length < 2) return null;

  return (
    <div className={cn('sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm', className)}>
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto px-6 py-2 scrollbar-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {sections.map((section) => (
          <button
            key={section.id}
            data-nav={section.id}
            onClick={() => scrollTo(section.id)}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors flex-shrink-0',
              activeId === section.id
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
            )}
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}
