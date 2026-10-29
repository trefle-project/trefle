import PublishedUrlClient from "./PublishedUrl.client";

/**
 * Server wrapper around `PublishedUrl.client.tsx` — reads `scheme`/`port`
 * from the environment at request time (`PUBLIC_SITE_PROTOCOL`/
 * `PUBLIC_SITE_PORT`; dev sets "http"/"3001" in
 * `infra/docker-compose.override.yml`, prod leaves both defaulted). See
 * `PageLiveUrl.tsx` for why this stays a tiny server component rather than
 * reading the vars directly in the client one (NEXT_PUBLIC_* would bake the
 * value into the client bundle at build time, fixing it to whichever
 * environment built the image instead of the one running it).
 */
const PublishedUrl = () => {
  const scheme = process.env.PUBLIC_SITE_PROTOCOL || "https";
  const port = process.env.PUBLIC_SITE_PORT || "";
  return <PublishedUrlClient scheme={scheme} port={port} />;
};

export default PublishedUrl;
