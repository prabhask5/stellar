"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { DownloadIcon, UploadIcon } from "@/components/ui/icons";
import { api, ApiRequestError } from "@/lib/client/api";
import { toast, toastError } from "@/lib/client/toast";
import { Section } from "./parts";

export function DataSection() {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<{ name: string; data: unknown } | null>(null);
  const [importing, setImporting] = useState(false);

  const exportAll = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/v1/export", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stellar-planner-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Export downloaded", { tone: "success" });
    } catch {
      toastError("Could not export your data. Try again.");
    }
    setExporting(false);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { format?: string };
      if (data?.format !== "stellar-planner-export") throw new Error("format");
      setPending({ name: file.name, data });
    } catch {
      toastError("That file is not a Stellar Planner export.");
    }
    if (input.current) input.current.value = "";
  };

  const runImport = async () => {
    if (!pending) return;
    setImporting(true);
    try {
      const res = await api<{ imported: Record<string, number> }>("/api/v1/import", {
        body: pending.data,
      });
      const total = Object.values(res.imported ?? {}).reduce((a, b) => a + b, 0);
      await client.invalidateQueries();
      toast(
        total === 0 ? "Nothing new to import" : `Imported ${total.toLocaleString("en-US")} items`,
        { tone: "success" },
      );
    } catch (err) {
      toastError(err instanceof ApiRequestError ? err.message : "The import failed.");
    }
    setImporting(false);
    setPending(null);
  };

  return (
    <Section
      id="data"
      title="Data"
      description="Your data lives in your own database. Exports include everything: tasks, goals, routines and their history, focus sessions, block lists and quotes."
    >
      <GroupedList>
        <ListRow
          title="Export everything"
          subtitle="One JSON file."
          trailing={
            <Button
              variant="secondary"
              size="sm"
              loading={exporting}
              icon={<DownloadIcon size={16} />}
              onClick={exportAll}
            >
              Export
            </Button>
          }
        />
        <ListRow
          title="Import"
          subtitle="Merges a Stellar Planner export into this account."
          trailing={
            <>
              <input
                ref={input}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Import file"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={importing}
                icon={<UploadIcon size={16} />}
                onClick={() => input.current?.click()}
              >
                Import
              </Button>
            </>
          }
        />
      </GroupedList>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Import this file?"
        body={`“${pending?.name ?? ""}” will be merged into your data. Items that already exist are updated; nothing is removed.`}
        confirmLabel="Import"
        destructive={false}
        onConfirm={() => void runImport()}
      />
    </Section>
  );
}
