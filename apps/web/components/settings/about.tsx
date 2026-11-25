"use client";

import { useQuery } from "@tanstack/react-query";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { api } from "@/lib/client/api";
import { enterDemo } from "@/lib/client/demo";
import { Section } from "./parts";

export function AboutSection() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api<{ version: string }>("/api/health"),
    staleTime: 60 * 60_000,
  });
  return (
    <Section id="about" title="About">
      <GroupedList>
        <ListRow
          title="Stellar Planner"
          subtitle="Self-hosted. Your data stays in your own database."
          trailing={
            <span className="tnum">{health.data ? `Version ${health.data.version}` : "…"}</span>
          }
        />
        <ListRow
          title="API"
          subtitle="A REST API for integrations and your own tools."
          trailing={
            <a href="/api/v1/openapi.json" className="text-accent hover:underline">
              OpenAPI
            </a>
          }
        />
        <ListRow
          title="Demo mode"
          subtitle="Open the app on sample data, to show it to someone. Your own data stays out of it, and Exit brings you back."
          onClick={enterDemo}
          trailing={<span className="text-accent">Open</span>}
        />
      </GroupedList>
    </Section>
  );
}
