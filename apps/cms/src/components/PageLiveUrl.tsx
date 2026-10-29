import PageLiveUrlClient from "./PageLiveUrl.client";

/**
 * Server wrapper around `PageLiveUrl.client.tsx` — reads `scheme`/`port`
 * from the environment at request time, same as `PublishedUrl.tsx`'s "Lien
 * public" link (`PUBLIC_SITE_PROTOCOL`/`PUBLIC_SITE_PORT`; dev sets
 * "http"/"3001" in `infra/docker-compose.override.yml`, prod leaves both
 * defaulted). Kept server-side rather than read directly in the client
 * component so the same built image serves the right value in dev and prod
 * without a rebuild — `NEXT_PUBLIC_*` vars get baked into the client bundle
 * at build time instead, which would fix the value to whichever environment
 * built the image.
 */
const PageLiveUrl = () => {
  const scheme = process.env.PUBLIC_SITE_PROTOCOL || "https";
  const port = process.env.PUBLIC_SITE_PORT || "";
  return <PageLiveUrlClient scheme={scheme} port={port} />;
};

export default PageLiveUrl;
