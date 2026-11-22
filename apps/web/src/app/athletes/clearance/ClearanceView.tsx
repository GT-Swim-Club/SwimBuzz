"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  athleteDisplayName,
  CLEARANCE_CHECK_LABEL,
  formatSeasonLabel,
  missingClearance,
  type ClearanceItem,
  type ClearanceListAthlete,
} from "@swimbuzz/shared"
import FluidToolbar from "@/components/ui/FluidToolbar"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import HoverDetail from "@/components/ui/HoverDetail"
import ActionIcon from "@/components/ui/ActionIcon"
import ClearanceFlag, { WarningGlyph } from "@/components/athlete/ClearanceFlag"
import { athletePath } from "@/lib/slug"
import ImportClearanceButton from "./ImportClearanceButton"
import EditClearanceModal from "./EditClearanceModal"

type Show = "uncleared" | "all"

const LIST_COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]"

function CheckStatus({ item, label }: { item: ClearanceItem; label: string }) {
  if (!item.cleared) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-warning-text">
        <WarningGlyph className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="md:hidden">{label} incomplete</span>
          <span className="hidden md:inline">Incomplete</span>
        </span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <ActionIcon kind="check" className="h-3.5 w-3.5 shrink-0 text-success-text" />
      <span>
        <span className="md:hidden">{label} complete</span>
        <span className="hidden md:inline">Complete</span>
      </span>
    </span>
  )
}

/**
 * Staff clearance list for a season's roster: who has completed the physical and the
 * concussion baseline test (both one-and-done — the season only picks the roster). Defaults to the athletes still missing one; staff can
 * import a sheet or correct one athlete by hand.
 */
export default function ClearanceView({
  season,
  seasons,
  athletes,
}: {
  season: string
  seasons: string[]
  athletes: ClearanceListAthlete[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const show: Show = searchParams.get("show") === "all" ? "all" : "uncleared"
  const query = searchParams.get("q")?.trim().toLowerCase() ?? ""
  const [editing, setEditing] = useState<ClearanceListAthlete | null>(null)

  function setParam(key: string, value: string, navigate: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    const href = `/athletes/clearance?${params.toString()}`
    if (navigate) router.push(href)
    else window.history.replaceState(null, "", href)
  }

  const missingById = useMemo(
    () => new Map(athletes.map((a) => [a.athleteId, missingClearance(a)])),
    [athletes]
  )
  const counts = useMemo(() => {
    const out = { uncleared: 0, physical: 0, concussion: 0 }
    for (const missing of missingById.values()) {
      if (missing.length > 0) out.uncleared += 1
      if (missing.includes("physical")) out.physical += 1
      if (missing.includes("concussion")) out.concussion += 1
    }
    return out
  }, [missingById])

  const rows = useMemo(() => {
    const pool = show === "all" ? athletes : athletes.filter((a) => (missingById.get(a.athleteId)?.length ?? 0) > 0)
    if (!query) return pool
    return pool.filter(
      (a) =>
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(query) ||
        !!a.preferredName?.toLowerCase().includes(query)
    )
  }, [athletes, missingById, query, show])

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">Clearance</h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Physical &amp; concussion test · {formatSeasonLabel(season)} roster
        </p>
        <p className="mt-2 text-sm text-foreground-secondary sm:text-base">
          {athletes.length === 0
            ? "No athletes on this season's roster."
            : counts.uncleared === 0
              ? `All ${athletes.length} athletes are cleared.`
              : `${counts.uncleared} of ${athletes.length} not cleared · ${counts.physical} missing a physical · ${counts.concussion} missing a concussion test`}
        </p>
      </header>

      <FluidToolbar
        pathname="/athletes/clearance"
        placeholder={`Search ${athletes.length} athletes…`}
        searchLabel="Search athletes"
        shallow
        controls={
          <>
            <ToolbarSelect
              label="Show"
              icon="list"
              current={show === "all" ? "Everyone" : "Not cleared"}
              active={show === "all"}
              value={show}
              onChange={(v) => setParam("show", v, false)}
            >
              <option value="uncleared">Not cleared ({counts.uncleared})</option>
              <option value="all">Everyone ({athletes.length})</option>
            </ToolbarSelect>
            <ToolbarSelect
              label="Season"
              icon="calendar"
              current={formatSeasonLabel(season)}
              active={false}
              value={season}
              onChange={(v) => setParam("season", v, true)}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {formatSeasonLabel(s)}
                </option>
              ))}
            </ToolbarSelect>
            <ImportClearanceButton season={season} />
          </>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border-secondary bg-background px-4 py-12 text-center text-sm text-foreground-secondary">
          {query
            ? `No athletes matching “${query}”.`
            : show === "uncleared" && athletes.length > 0
              ? "Everyone on the roster is cleared."
              : "No athletes on this season's roster."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div
            className={`hidden ${LIST_COLS} gap-3 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-foreground-tertiary md:grid`}
          >
            <span>Athlete</span>
            <span>{CLEARANCE_CHECK_LABEL.physical}</span>
            <span>{CLEARANCE_CHECK_LABEL.concussion}</span>
            <span className="sr-only">Edit</span>
          </div>
          <ul className="divide-y divide-border-secondary">
            {rows.map((a) => (
              <li key={a.athleteId} className={`grid ${LIST_COLS} items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-background-hover`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {a.slug ? (
                      <Link
                        href={athletePath(a.slug)}
                        className="truncate font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {athleteDisplayName(a)}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-foreground">{athleteDisplayName(a)}</span>
                    )}
                    <ClearanceFlag missing={missingById.get(a.athleteId)} />
                  </div>
                  {a.source === "MANUAL" && (
                    <p className="text-xs text-foreground-tertiary">Edited by hand</p>
                  )}
                  {/* Phones: the two checks stack under the name. */}
                  <div className="mt-1 flex flex-col gap-0.5 md:hidden">
                    <CheckStatus item={a.physical} label={CLEARANCE_CHECK_LABEL.physical} />
                    <CheckStatus item={a.concussion} label={CLEARANCE_CHECK_LABEL.concussion} />
                  </div>
                </div>
                <div className="hidden md:block">
                  <CheckStatus item={a.physical} label={CLEARANCE_CHECK_LABEL.physical} />
                </div>
                <div className="hidden md:block">
                  <CheckStatus item={a.concussion} label={CLEARANCE_CHECK_LABEL.concussion} />
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  aria-label={`Edit clearance for ${athleteDisplayName(a)}`}
                  className="group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-fill-secondary hover:text-foreground"
                >
                  <ActionIcon kind="edit" className="h-4 w-4" />
                  <HoverDetail label="Edit" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <EditClearanceModal
        athlete={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          router.refresh()
        }}
      />
    </>
  )
}
