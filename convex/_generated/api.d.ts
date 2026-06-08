/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as audit from "../audit.js";
import type * as channels from "../channels.js";
import type * as config from "../config.js";
import type * as context from "../context.js";
import type * as crons from "../crons.js";
import type * as goals from "../goals.js";
import type * as jobs from "../jobs.js";
import type * as knowledge from "../knowledge.js";
import type * as memory from "../memory.js";
import type * as routines from "../routines.js";
import type * as secrets from "../secrets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  audit: typeof audit;
  channels: typeof channels;
  config: typeof config;
  context: typeof context;
  crons: typeof crons;
  goals: typeof goals;
  jobs: typeof jobs;
  knowledge: typeof knowledge;
  memory: typeof memory;
  routines: typeof routines;
  secrets: typeof secrets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
