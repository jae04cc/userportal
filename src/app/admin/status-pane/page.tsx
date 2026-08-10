import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, statusItems, statusItemGroups } from "@/lib/db/schema";
import { Button, Field, Panel, inputClass } from "@/components/admin/ui";
import { StatusItemForm } from "@/components/admin/StatusItemForm";
import { StatusPaneImport } from "@/components/admin/StatusPaneImport";
import {
  createStatusItem,
  deleteStatusItem,
  moveStatusItem,
  setPaneLayout,
  updateStatusItem,
} from "@/lib/actions/statusPane";
import { getKumaConfig, getSetting, getStatusPaneColumns, SETTING_KEYS } from "@/lib/settings";
import { discoverMonitors } from "@/lib/status";

export const dynamic = "force-dynamic";

const VISIBILITY_LABEL = {
  all: "Everyone",
  groups: "Groups",
  admin: "Admins only",
} as const;

export default async function AdminStatusPanePage() {
  const kuma = await getKumaConfig();

  const [items, allGroups, itemGroups, monitors, showPing, paneColumns] = await Promise.all([
    db.select().from(statusItems).orderBy(asc(statusItems.sortOrder), asc(statusItems.label)),
    db.select().from(groups).orderBy(asc(groups.name)),
    db.select().from(statusItemGroups),
    kuma.configured ? discoverMonitors() : Promise.resolve([]),
    getSetting(SETTING_KEYS.statusPaneShowPing),
    getStatusPaneColumns(),
  ]);

  const groupsByItem = new Map<string, string[]>();
  for (const g of itemGroups) {
    groupsByItem.set(g.statusItemId, [...(groupsByItem.get(g.statusItemId) ?? []), g.groupId]);
  }

  const groupOptions = allGroups.map((g) => ({ id: g.id, name: g.name }));
  const monitorOptions = monitors.map((m) => ({ id: m.id, name: m.name }));
  const monitorNames = new Map(monitors.map((m) => [m.id, m.name]));

  return (
    <>
      <Panel
        title="Status pane"
        description="A slim strip of tiles above the message of the day. Each tile is one Uptime Kuma monitor, with a heartbeat strip of its recent checks."
      >
        <form action={setPaneLayout} className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Columns"
            htmlFor="pane-columns"
            hint="Applies on phones too. Narrow columns drop the status word, uptime and ping to fit — the glyph and bars always stay."
          >
            <select
              id="pane-columns"
              name="columns"
              defaultValue={String(paneColumns)}
              className={inputClass}
            >
              <option value="1">One — full width</option>
              <option value="2">Two</option>
              <option value="3">Three — most compact</option>
            </select>
          </Field>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                name="showPing"
                defaultChecked={showPing !== "false"}
                className="h-4 w-4"
              />
              Show response time
              <span className="text-xs text-slate-600">(wide screens only)</span>
            </label>
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" variant="primary">
              Save layout
            </Button>
          </div>
        </form>
      </Panel>

      {kuma.configured ? (
        <Panel title="Add tiles from Uptime Kuma">
          <StatusPaneImport
            monitors={monitors}
            takenKeys={items.map((i) => i.monitorKey)}
          />
        </Panel>
      ) : (
        <Panel title="Uptime monitoring not configured">
          <p className="text-sm text-slate-400">
            Set up the Uptime Kuma connection on the Monitoring tab first — the pane has nothing to
            show without it.
          </p>
        </Panel>
      )}

      <Panel title="Tiles">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tiles yet. The pane stays hidden entirely until you add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="rounded-md border border-surface-border bg-surface-base p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-100">{item.label}</span>
                  <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-slate-400">
                    {VISIBILITY_LABEL[item.visibility]}
                  </span>
                  {!item.isEnabled ? (
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-amber-400">
                      Hidden
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-600">
                    monitor: {monitorNames.get(item.monitorKey) ?? item.monitorKey}
                  </span>

                  <span className="ml-auto flex gap-1.5">
                    <form action={moveStatusItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="direction" value="up" />
                      <Button type="submit" aria-label={`Move ${item.label} up`} disabled={index === 0}>
                        ↑
                      </Button>
                    </form>
                    <form action={moveStatusItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="direction" value="down" />
                      <Button
                        type="submit"
                        aria-label={`Move ${item.label} down`}
                        disabled={index === items.length - 1}
                      >
                        ↓
                      </Button>
                    </form>
                    <form action={deleteStatusItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button type="submit" variant="danger">
                        Remove
                      </Button>
                    </form>
                  </span>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-sky-400">Edit</summary>
                  <div className="mt-3">
                    <StatusItemForm
                      action={updateStatusItem}
                      groups={groupOptions}
                      monitors={monitorOptions}
                      submitLabel="Save changes"
                      initial={{
                        id: item.id,
                        label: item.label,
                        monitorKey: item.monitorKey,
                        visibility: item.visibility,
                        isEnabled: item.isEnabled,
                        groupIds: groupsByItem.get(item.id) ?? [],
                      }}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-sky-400">Add a tile manually</summary>
          <div className="mt-3">
            <StatusItemForm
              action={createStatusItem}
              groups={groupOptions}
              monitors={monitorOptions}
              submitLabel="Add tile"
              initial={{
                label: "",
                monitorKey: monitorOptions[0]?.id ?? "",
                visibility: "all",
                isEnabled: true,
                groupIds: [],
              }}
            />
          </div>
        </details>
      </Panel>
    </>
  );
}
