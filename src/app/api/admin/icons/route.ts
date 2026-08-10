import { NextResponse } from "next/server";
import { requireAdminApi, AuthError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { saveIconUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Admin-only icon upload. Validation lives in saveIconUpload. */
export async function POST(req: Request) {
  try {
    const actor = await requireAdminApi();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    const result = await saveIconUpload(file);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await recordAudit({
      actor,
      action: "create",
      entityType: "service",
      summary: `Uploaded icon ${result.url}`,
    });

    return NextResponse.json({ url: result.url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
