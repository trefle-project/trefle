/* PAYLOAD 3 BOILERPLATE — admin UI entrypoint. */
import type { Metadata } from "next";

import config from "@payload-config";
import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import { getPayload } from "payload";

import { readBranding, withBranding } from "../../../../lib/branding";
import { importMap } from "../importMap.js";

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};

// 022-ux-improvement (US4) — the operator's name in the tab title and their
// favicon, read from Settings on every request.
export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
  const meta = await generatePageMetadata({ config, params, searchParams });
  return withBranding(meta as Parameters<typeof withBranding>[0], await readBranding(await getPayload({ config }))) as Metadata;
};

const Page = ({ params, searchParams }: Args) =>
  RootPage({ config, params, searchParams, importMap });

export default Page;
