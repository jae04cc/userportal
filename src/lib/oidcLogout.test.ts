import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLogoutUrl,
  clearEndSessionCache,
  fetchEndSessionEndpoint,
  postLogoutRedirectUri,
} from "@/lib/oidcLogout";

const ENDPOINT = "https://authentik.example.com/application/o/portal/end-session/";

describe("buildLogoutUrl", () => {
  it("sends the hint, the client and the return address", () => {
    const url = new URL(
      buildLogoutUrl({
        endSessionEndpoint: ENDPOINT,
        idToken: "eyJhbGciOi.PAYLOAD.SIG",
        clientId: "portal-client",
        postLogoutRedirectUri: "https://my.murky.media/logged-out",
      })!
    );

    expect(url.origin + url.pathname).toBe(
      "https://authentik.example.com/application/o/portal/end-session/"
    );
    expect(url.searchParams.get("id_token_hint")).toBe("eyJhbGciOi.PAYLOAD.SIG");
    expect(url.searchParams.get("client_id")).toBe("portal-client");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://my.murky.media/logged-out"
    );
  });

  it("omits parameters it doesn't have rather than sending them empty", () => {
    // An empty post_logout_redirect_uri is a validation error at most
    // providers, not something they ignore.
    const url = new URL(buildLogoutUrl({ endSessionEndpoint: ENDPOINT })!);
    expect(url.search).toBe("");

    for (const empty of [null, undefined, ""]) {
      const partial = new URL(
        buildLogoutUrl({
          endSessionEndpoint: ENDPOINT,
          idToken: empty,
          clientId: "c",
          postLogoutRedirectUri: empty,
        })!
      );
      expect(partial.searchParams.has("id_token_hint")).toBe(false);
      expect(partial.searchParams.has("post_logout_redirect_uri")).toBe(false);
      expect(partial.searchParams.get("client_id")).toBe("c");
    }
  });

  it("keeps any query string the endpoint already carried", () => {
    const url = new URL(
      buildLogoutUrl({
        endSessionEndpoint: `${ENDPOINT}?tenant=main`,
        clientId: "portal",
      })!
    );
    expect(url.searchParams.get("tenant")).toBe("main");
    expect(url.searchParams.get("client_id")).toBe("portal");
  });

  it("escapes values rather than concatenating them", () => {
    const url = buildLogoutUrl({
      endSessionEndpoint: ENDPOINT,
      postLogoutRedirectUri: "https://portal.example.com/logged-out?a=b&c=d",
    })!;
    expect(url).toContain("post_logout_redirect_uri=https%3A%2F%2Fportal.example.com%2Flogged-out");
    // The nested query must not leak out as separate parameters.
    expect(new URL(url).searchParams.get("c")).toBeNull();
  });

  it("refuses anything that isn't a usable http(s) endpoint", () => {
    for (const bad of ["", "not a url", "/end-session", "javascript:alert(1)", "ftp://x/y"]) {
      expect(buildLogoutUrl({ endSessionEndpoint: bad })).toBeNull();
    }
  });
});

describe("fetchEndSessionEndpoint", () => {
  let server: Server | null = null;
  let hits = 0;

  /** A stand-in identity provider serving one discovery document. */
  async function serve(handler: (path: string) => { status: number; body?: string }) {
    hits = 0;
    server = createServer((req, res) => {
      hits += 1;
      const { status, body } = handler(req.url ?? "");
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body ?? "");
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address === "string" || !address) throw new Error("no port");
    return `http://127.0.0.1:${address.port}`;
  }

  afterEach(async () => {
    clearEndSessionCache();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  });

  it("reads end_session_endpoint out of the discovery document", async () => {
    const issuer = await serve((path) =>
      path === "/.well-known/openid-configuration"
        ? { status: 200, body: JSON.stringify({ end_session_endpoint: "https://idp/end-session/" }) }
        : { status: 404 }
    );
    expect(await fetchEndSessionEndpoint(issuer)).toBe("https://idp/end-session/");
  });

  it("tolerates a trailing slash on the issuer", async () => {
    const issuer = await serve((path) =>
      path === "/.well-known/openid-configuration"
        ? { status: 200, body: JSON.stringify({ end_session_endpoint: "https://idp/end-session/" }) }
        : { status: 404 }
    );
    expect(await fetchEndSessionEndpoint(`${issuer}///`)).toBe("https://idp/end-session/");
  });

  it("caches, so pressing sign out doesn't wait on discovery every time", async () => {
    const issuer = await serve(() => ({
      status: 200,
      body: JSON.stringify({ end_session_endpoint: "https://idp/end-session/" }),
    }));
    await fetchEndSessionEndpoint(issuer);
    await fetchEndSessionEndpoint(issuer);
    await fetchEndSessionEndpoint(issuer);
    expect(hits).toBe(1);
  });

  it("returns null when the provider doesn't advertise one", async () => {
    const issuer = await serve(() => ({
      status: 200,
      body: JSON.stringify({ authorization_endpoint: "https://idp/authorize" }),
    }));
    expect(await fetchEndSessionEndpoint(issuer)).toBeNull();
  });

  it("returns null rather than throwing on an error response", async () => {
    const issuer = await serve(() => ({ status: 500, body: "nope" }));
    expect(await fetchEndSessionEndpoint(issuer)).toBeNull();
  });

  it("returns null rather than throwing on malformed JSON", async () => {
    const issuer = await serve(() => ({ status: 200, body: "<html>not json</html>" }));
    expect(await fetchEndSessionEndpoint(issuer)).toBeNull();
  });

  it("returns null rather than throwing when the provider is unreachable", async () => {
    // Nothing listening: signing out must still work, locally.
    expect(await fetchEndSessionEndpoint("http://127.0.0.1:1")).toBeNull();
  });

  it("caches a negative answer too", async () => {
    const issuer = await serve(() => ({ status: 404 }));
    await fetchEndSessionEndpoint(issuer);
    await fetchEndSessionEndpoint(issuer);
    expect(hits).toBe(1);
  });
});

describe("postLogoutRedirectUri", () => {
  it("points at the signed-out page on the portal's own origin", () => {
    expect(postLogoutRedirectUri("https://my.murky.media")).toBe(
      "https://my.murky.media/logged-out"
    );
    // A trailing path on the origin is replaced, not appended to.
    expect(postLogoutRedirectUri("https://my.murky.media/")).toBe(
      "https://my.murky.media/logged-out"
    );
  });

  it("returns null for an unusable origin", () => {
    expect(postLogoutRedirectUri("")).toBeNull();
    expect(postLogoutRedirectUri("nonsense")).toBeNull();
  });
});
