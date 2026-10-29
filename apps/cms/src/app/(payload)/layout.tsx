/* THIS FILE IS GENERATED-STYLE BOILERPLATE FOR PAYLOAD 3 — safe to keep as-is. */
import type { ServerFunctionClient } from "payload";

import config from "@payload-config";
import { RootLayout, handleServerFunctions } from "@payloadcms/next/layouts";
import { importMap } from "./admin/importMap.js";
import React from "react";

import "@payloadcms/next/css";
// 022-ux-improvement — Trefle's admin styles, after Payload's.
import "./custom.css";

type Args = { children: React.ReactNode };

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
);

export default Layout;
