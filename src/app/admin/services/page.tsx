import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, groups, services, serviceGroups } from "@/lib/db/schema";
import { Button, Field, Panel, inputClass } from "@/components/admin/ui";
import { ServiceForm } from "@/components/admin/ServiceForm";
import {
  createCategory,
  createService,
  deleteCategory,
  deleteService,
  moveCategory,
  moveService,
  renameCategory,
  updateService,
} from "@/lib/actions/catalog";

export const dynamic = "force-dynamic";

const VISIBILITY_LABEL = {
  all: "Everyone",
  groups: "Groups",
  admin: "Admins only",
} as const;

export default async function AdminServicesPage() {
  const [allCategories, allServices, allGroups, allServiceGroups] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(services).orderBy(asc(services.sortOrder), asc(services.name)),
    db.select().from(groups).orderBy(asc(groups.sortOrder), asc(groups.name)),
    db.select().from(serviceGroups),
  ]);

  const groupsByService = new Map<string, string[]>();
  for (const sg of allServiceGroups) {
    groupsByService.set(sg.serviceId, [...(groupsByService.get(sg.serviceId) ?? []), sg.groupId]);
  }

  const groupOptions = allGroups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <>
      <Panel title="Add a category" description="Categories are the headings service cards sit under.">
        <form action={createCategory} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label="Category name" htmlFor="new-category">
              <input id="new-category" name="name" required className={inputClass} />
            </Field>
          </div>
          <Button type="submit" variant="primary">
            Add category
          </Button>
        </form>
      </Panel>

      {allCategories.length === 0 ? (
        <Panel title="No categories yet">
          <p className="text-sm text-slate-500">Add a category above to start adding services.</p>
        </Panel>
      ) : null}

      {allCategories.map((category, index) => {
        const own = allServices.filter((s) => s.categoryId === category.id);

        return (
          <Panel key={category.id} title={`Category — ${category.name}`}>
            <div className="mb-5 flex flex-wrap items-end gap-2">
              {/* Rename sits first and is labelled, since "where do I rename a
                  category" was the first thing that wasn't findable. */}
              <form action={renameCategory} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={category.id} />
                <div className="min-w-52">
                  <Field label="Category name" htmlFor={`rename-${category.id}`}>
                    <input
                      id={`rename-${category.id}`}
                      name="name"
                      defaultValue={category.name}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Button type="submit" variant="primary">
                  Rename
                </Button>
              </form>

              <form action={moveCategory}>
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="direction" value="up" />
                <Button type="submit" aria-label={`Move ${category.name} up`} disabled={index === 0}>
                  ↑
                </Button>
              </form>
              <form action={moveCategory}>
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="direction" value="down" />
                <Button
                  type="submit"
                  aria-label={`Move ${category.name} down`}
                  disabled={index === allCategories.length - 1}
                >
                  ↓
                </Button>
              </form>

              <form action={deleteCategory}>
                <input type="hidden" name="id" value={category.id} />
                <Button type="submit" variant="danger">
                  Delete category
                </Button>
              </form>
            </div>

            <ul className="mb-4 space-y-2">
              {own.length === 0 ? (
                <li className="text-sm text-slate-600">No services in this category yet.</li>
              ) : null}

              {own.map((service, sIndex) => (
                <li
                  key={service.id}
                  className="rounded-md border border-surface-border bg-surface-base p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-100">{service.name}</span>
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-slate-400">
                      {VISIBILITY_LABEL[service.visibility]}
                    </span>
                    {!service.isEnabled ? (
                      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-amber-400">
                        Disabled
                      </span>
                    ) : null}
                    {service.monitorKey ? (
                      <span className="text-xs text-slate-600">monitor: {service.monitorKey}</span>
                    ) : null}

                    <span className="ml-auto flex gap-1.5">
                      <form action={moveService}>
                        <input type="hidden" name="id" value={service.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button
                          type="submit"
                          aria-label={`Move ${service.name} up`}
                          disabled={sIndex === 0}
                        >
                          ↑
                        </Button>
                      </form>
                      <form action={moveService}>
                        <input type="hidden" name="id" value={service.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          aria-label={`Move ${service.name} down`}
                          disabled={sIndex === own.length - 1}
                        >
                          ↓
                        </Button>
                      </form>
                      <form action={deleteService}>
                        <input type="hidden" name="id" value={service.id} />
                        <Button type="submit" variant="danger">
                          Delete
                        </Button>
                      </form>
                    </span>
                  </div>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-sky-400">Edit</summary>
                    <div className="mt-3">
                      <ServiceForm
                        action={updateService}
                        categories={allCategories}
                        groups={groupOptions}
                        submitLabel="Save changes"
                        initial={{
                          id: service.id,
                          categoryId: service.categoryId,
                          name: service.name,
                          description: service.description ?? "",
                          icon: service.icon ?? "",
                          url: service.url,
                          monitorKey: service.monitorKey ?? "",
                          visibility: service.visibility,
                          isEnabled: service.isEnabled,
                          groupIds: groupsByService.get(service.id) ?? [],
                        }}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>

            <details>
              <summary className="cursor-pointer text-sm text-sky-400">
                Add a service to {category.name}
              </summary>
              <div className="mt-3">
                <ServiceForm
                  action={createService}
                  categories={allCategories}
                  groups={groupOptions}
                  submitLabel="Add service"
                  initial={{
                    categoryId: category.id,
                    name: "",
                    description: "",
                    icon: "",
                    url: "",
                    monitorKey: "",
                    visibility: "all",
                    isEnabled: true,
                    groupIds: [],
                  }}
                />
              </div>
            </details>
          </Panel>
        );
      })}
    </>
  );
}
