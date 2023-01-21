// deno-lint-ignore-file no-explicit-any
import { PromiseOrValue } from "../promise.ts";
import { WorkflowRunner } from "../workers/runner.ts";
import { runnerBuilder } from "./creators.ts";
import { deno, http as httpRunner } from "./runners.ts";

export interface WorkflowRegistry {
  get(alias: string): PromiseOrValue<WorkflowRunner | undefined>;
}
export interface WorkflowExecutorRefBase {
  type: string;
  alias: string;
}
export interface DenoWorkflowRunnerRef extends WorkflowExecutorRefBase {
  type: "deno";
  url: string;
}

export interface HttpWorkflowRunnerRef extends WorkflowExecutorRefBase {
  type: "http";
  url: string;
}

export type WorkflowRunnerRef =
  | DenoWorkflowRunnerRef
  | HttpWorkflowRunnerRef;

export interface RegistryBase {
  type: string;
}

export interface GithubRegistry extends RegistryBase {
  org: string;
  repo: string;
  defaultBranch?: string;
  path?: string;
  type: "github";
}

export interface HttpRegistry extends RegistryBase {
  type: "http";
  baseUrl: string;
}

export interface InlineRegistry extends RegistryBase {
  type: "inline";
  ref: WorkflowRunnerRef;
}

export type Registry = GithubRegistry | HttpRegistry | InlineRegistry;

const inline = ({ ref }: InlineRegistry) => {
  const runnerPromise = runnerBuilder[ref.type](ref);
  return (_: string) => {
    return runnerPromise;
  };
};

const http = ({ baseUrl }: HttpRegistry) => (alias: string): WorkflowRunner => {
  return httpRunner({ alias, url: `${baseUrl}/${alias}`, type: "http" });
};

const github =
  ({ repo, org, path, defaultBranch }: GithubRegistry) =>
  async (alias: string): Promise<WorkflowRunner> => {
    const [name, ref] = alias.split("@");
    return await deno({
      alias,
      url: `https://raw.githubusercontent.com/${org}/${repo}/${
        ref ?? defaultBranch ?? "main"
      }${path}/${name}.ts`,
      type: "deno",
    });
  };

const providers: Record<
  Registry["type"],
  (
    registry: any,
  ) => (alias: string) => PromiseOrValue<WorkflowRunner>
> = {
  http,
  github,
  inline,
};

const buildProvider = (registry: Registry) => {
  return providers[registry.type](registry);
};

const buildAll = (
  registries: Record<string, Registry>,
): Record<string, (alias: string) => PromiseOrValue<WorkflowRunner>> => {
  return Object.keys(registries).reduce(
    (
      result: Record<
        string,
        (alias: string) => PromiseOrValue<WorkflowRunner>
      >,
      key,
    ) => {
      result[key] = buildProvider(registries[key]);
      return result;
    },
    {},
  );
};
const TRUSTED_REGISTRIES = Deno.env.get("TRUSTED_REGISTRIES_URL") ??
  "https://raw.githubusercontent.com/mcandeia/trusted-registries/main/registries.ts";

const fetchTrusted = async (): Promise<
  Record<string, Registry>
> => {
  const registries = await import(TRUSTED_REGISTRIES);
  if (registries?.default === undefined) {
    throw new Error(
      `could not load trusted repositories: ${TRUSTED_REGISTRIES}`,
    );
  }
  return await registries.default();
};

const REBUILD_TRUSTED_INTERVAL_MS = 1_000 * 60;
export const buildWorkflowRegistry = async () => {
  const trustedRegistries = await fetchTrusted();
  let current = buildAll(trustedRegistries);
  setInterval(() => {
    fetchTrusted().then((trusted) => {
      current = buildAll(trusted);
    });
  }, REBUILD_TRUSTED_INTERVAL_MS);
  return {
    get: async (alias: string) => {
      const [namespace, name] = alias.split(".");
      const getExecutor = namespace.length === 0
        ? current[alias]
        : current[namespace];
      if (getExecutor === undefined) {
        return undefined;
      }
      return await getExecutor(name);
    },
  };
};
